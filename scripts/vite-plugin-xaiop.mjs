/**
 * Vite plugin: 检查并按需编译 vendored XAIOP SDK。
 *
 * 背景：`@bylan280/xaiop` 的 package.json 指向 `dist/`，而 Morfa 只提交源码，
 * 因此首次启动、源码变化或 dist 缺失时需要先执行 TypeScript 编译。
 *
 * 使用方式（未来 apps/web 的 vite.config.ts）：
 *
 *   import { xaiopSourcePlugin } from "../../scripts/vite-plugin-xaiop.mjs";
 *   export default defineConfig({
 *     plugins: [xaiopSourcePlugin(), react()],
 *   });
 *
 * 行为：
 * - `configResolved` / `buildStart` 前检查 dist，必要时编译；
 * - 开发服务器监听 vendored `src/**\/*.ts`，变更后重编译并整页刷新；
 * - 校验 Node、browser、core 三类入口是否齐全；
 * - 通过 `XAIOP_SKIP_BUILD=1` 可跳过检查（仅用于已确认 dist 存在的 CI 场景）。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

/** Morfa 仓库根目录 */
export const MORFA_ROOT = path.resolve(scriptsDir, "..");

/** vendored XAIOP 根目录 */
export const XAIOP_VENDOR_ROOT = path.join(MORFA_ROOT, "vendor", "xaiop");

/** vendored Node SDK 包目录 */
export const XAIOP_PACKAGE_DIR = path.join(
  XAIOP_VENDOR_ROOT,
  "xaiop-sdk",
  "nodejs",
);

const DIST_DIR = path.join(XAIOP_PACKAGE_DIR, "dist");
const SRC_DIR = path.join(XAIOP_PACKAGE_DIR, "src");
const TSCONFIG = path.join(XAIOP_PACKAGE_DIR, "tsconfig.json");

/** 编译后必须存在的入口，覆盖 Node / browser / core 与类型声明 */
const REQUIRED_OUTPUTS = [
  "index.js",
  "index.d.ts",
  "browser/index.js",
  "browser/index.d.ts",
  "core/index.js",
  "core/index.d.ts",
];

let activeBuild = null;

function listFiles(dir, predicate) {
  const result = [];
  if (!fs.existsSync(dir)) return result;

  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (!predicate || predicate(full)) result.push(full);
    }
  }
  return result;
}

function newestMtime(files) {
  let newest = 0;
  for (const file of files) {
    try {
      newest = Math.max(newest, fs.statSync(file).mtimeMs);
    } catch {
      // 文件在检查过程中被删除时忽略，下一次检查会重新判断
    }
  }
  return newest;
}

/**
 * 判断 dist 是否存在且不早于任何源文件或构建配置。
 * @returns {boolean}
 */
export function isXaiopBuildFresh() {
  for (const relative of REQUIRED_OUTPUTS) {
    if (!fs.existsSync(path.join(DIST_DIR, relative))) return false;
  }

  const sourceFiles = listFiles(
    SRC_DIR,
    (file) => file.endsWith(".ts") && !file.endsWith(".d.ts"),
  );
  const configFiles = [TSCONFIG, path.join(XAIOP_PACKAGE_DIR, "package.json")];
  const newestSource = newestMtime([...sourceFiles, ...configFiles]);
  const oldestOutput = REQUIRED_OUTPUTS.reduce((oldest, relative) => {
    const mtime = fs.statSync(path.join(DIST_DIR, relative)).mtimeMs;
    return Math.min(oldest, mtime);
  }, Number.POSITIVE_INFINITY);

  return oldestOutput >= newestSource;
}

function resolveTsc() {
  const require = createRequire(path.join(XAIOP_PACKAGE_DIR, "package.json"));

  try {
    const packageJsonPath = require.resolve("typescript/package.json");
    return path.join(path.dirname(packageJsonPath), "bin", "tsc");
  } catch {
    // 继续尝试明确的 node_modules 路径，给出更清晰的错误
  }

  const fallback = path.join(MORFA_ROOT, "node_modules", "typescript", "bin", "tsc");
  if (fs.existsSync(fallback)) return fallback;

  throw new Error(
    "[xaiop] 找不到 TypeScript。请先在仓库根目录执行 `npm install`，再重试。",
  );
}

function runTsc(tscPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [tscPath, "-p", TSCONFIG, "--pretty", "false"],
      {
        cwd: XAIOP_PACKAGE_DIR,
        stdio: "inherit",
        env: process.env,
      },
    );

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[xaiop] TypeScript 编译失败（退出码 ${code}）`));
    });
  });
}

/**
 * 编译 vendored XAIOP SDK，并校验输出入口。
 * @param {{ force?: boolean, silent?: boolean }} [options]
 * @returns {Promise<boolean>} 是否实际执行了编译
 */
export async function ensureXaiopBuilt(options = {}) {
  const { force = false, silent = false } = options;

  if (process.env.XAIOP_SKIP_BUILD === "1") {
    if (!silent) {
      console.log("[xaiop] XAIOP_SKIP_BUILD=1，跳过构建检查");
    }
    return false;
  }

  if (!force && isXaiopBuildFresh()) return false;

  if (activeBuild) return activeBuild;

  activeBuild = (async () => {
    const startedAt = Date.now();
    if (!silent) console.log("[xaiop] 正在编译 vendored SDK…");

    const tscPath = resolveTsc();
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
    await runTsc(tscPath);

    const missing = REQUIRED_OUTPUTS.filter(
      (relative) => !fs.existsSync(path.join(DIST_DIR, relative)),
    );
    if (missing.length > 0) {
      throw new Error(`[xaiop] 编译完成但缺少入口：${missing.join(", ")}`);
    }

    if (!silent) {
      console.log(`[xaiop] SDK 编译完成（${Date.now() - startedAt} ms）`);
    }
    return true;
  })().finally(() => {
    activeBuild = null;
  });

  return activeBuild;
}

/**
 * 创建 Vite 插件。
 * @param {{ force?: boolean, watch?: boolean, prebundle?: boolean }} [options]
 */
export function xaiopSourcePlugin(options = {}) {
  const { force = false, watch = true, prebundle = true } = options;

  return {
    name: "morfa:xaiop-source",
    enforce: "pre",

    config() {
      if (!prebundle) return undefined;
      return {
        optimizeDeps: {
          include: ["@bylan280/xaiop/browser", "@bylan280/xaiop/core"],
        },
      };
    },

    async configResolved() {
      await ensureXaiopBuilt({ force });
    },

    async buildStart() {
      await ensureXaiopBuilt({ force });
    },

    configureServer(server) {
      if (!watch) return undefined;

      let timer = null;
      let queue = Promise.resolve();

      const scheduleRebuild = (file) => {
        if (!file.startsWith(SRC_DIR)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          queue = queue.then(async () => {
            try {
              await ensureXaiopBuilt({ force: true });
              server.ws.send({ type: "full-reload" });
            } catch (error) {
              server.config.logger.error(
                `[xaiop] 热重编译失败：${error instanceof Error ? error.message : String(error)}`,
              );
            }
          });
        }, 150);
      };

      server.watcher.add(SRC_DIR);
      const onChange = (file) => scheduleRebuild(file);
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);

      server.httpServer?.once("close", () => {
        if (timer) clearTimeout(timer);
        server.watcher.off("change", onChange);
        server.watcher.off("add", onChange);
        server.watcher.off("unlink", onChange);
      });

      return undefined;
    },
  };
}

export default xaiopSourcePlugin;
