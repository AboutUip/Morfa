import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { WEB_ORIGIN } from "../config.js";
import { ApiError } from "../lib/errors.js";
import {
  getProjectCanvas,
  type CanvasPageDto,
} from "./canvasDocuments.js";
import {
  resolveCanvasCaptureGeometry,
  type CanvasCaptureGeometry,
  type CanvasCaptureMode,
} from "./canvasScreenshotGeometry.js";
import { createRenderToken } from "./renderTokens.js";
import {
  getScreenshotCache,
  setScreenshotCache,
} from "./screenshotCache.js";

const execFileAsync = promisify(execFile);
const MAX_SCREENSHOT_SCALE = 3;
const MIN_SCREENSHOT_SCALE = 0.5;
const MAX_SCREENSHOT_SIDE = 4000;
const CHROME_TIMEOUT_MS = 30_000;
const WEB_RENDERER_CHECK_TIMEOUT_MS = 1_500;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH ?? "",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function clampScale(scale: number) {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(
    MAX_SCREENSHOT_SCALE,
    Math.max(MIN_SCREENSHOT_SCALE, scale),
  );
}

function assertScreenshotSize(
  width: number,
  height: number,
  label: string,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new ApiError(
      400,
      "SCREENSHOT_INVALID_SIZE",
      `${label}尺寸无效`,
    );
  }
  if (width > MAX_SCREENSHOT_SIDE || height > MAX_SCREENSHOT_SIDE) {
    throw new ApiError(
      413,
      "SCREENSHOT_TOO_LARGE",
      `${label}尺寸超出截图限制`,
    );
  }
}

async function resolveChromePath() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new ApiError(
    503,
    "SCREENSHOT_BROWSER_MISSING",
    "截图需要 Chrome/Chromium，请设置 CHROME_PATH",
  );
}

/**
 * Screenshots are rendered by the real web app. Fail fast with a clear 503
 * when the configured web origin is not running instead of launching Chrome
 * against a dead URL.
 */
async function assertWebRendererReachable() {
  const origin = WEB_ORIGIN.replace(/\/+$/, "");

  try {
    const response = await fetch(`${origin}/`, {
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(WEB_RENDERER_CHECK_TIMEOUT_MS),
    });
    await response.arrayBuffer().catch(() => {});
  } catch {
    throw new ApiError(
      503,
      "SCREENSHOT_WEB_RENDERER_UNAVAILABLE",
      `截图需要 Web 渲染器，请先启动 Web 服务 (${origin})`,
    );
  }
}

function chromeErrorDetail(error: unknown) {
  if (error && typeof error === "object") {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim()) {
      return stderr.trim().replace(/\s+/g, " ").slice(0, 400);
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim().replace(/\s+/g, " ").slice(0, 400);
    }
  }
  return "未知错误";
}

function assertPng(buffer: Buffer) {
  if (
    buffer.length < PNG_SIGNATURE.length ||
    !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    throw new ApiError(
      502,
      "SCREENSHOT_RENDER_FAILED",
      "Web 渲染器没有返回有效的 PNG 截图",
    );
  }
}

async function captureRenderedUrl(
  chrome: string,
  url: string,
  width: number,
  height: number,
  scale: number,
) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "morfa-shot-"));
  const pngPath = path.join(dir, "page.png");

  try {
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--mute-audio",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      `--force-device-scale-factor=${scale}`,
      `--window-size=${Math.ceil(width)},${Math.ceil(height)}`,
      "--virtual-time-budget=5000",
      `--screenshot=${pngPath}`,
      url,
    ];

    try {
      await execFileAsync(chrome, args, {
        timeout: CHROME_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (error) {
      throw new ApiError(
        502,
        "SCREENSHOT_RENDER_FAILED",
        `Chrome 渲染截图失败: ${chromeErrorDetail(error)}`,
      );
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(pngPath);
    } catch {
      throw new ApiError(
        502,
        "SCREENSHOT_RENDER_FAILED",
        "Chrome 没有生成截图文件",
      );
    }

    assertPng(buffer);
    return buffer.toString("base64");
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function captureWithWebRenderer({
  userId,
  projectId,
  mode,
  pageId,
  geometry,
  scale,
}: {
  userId: string;
  projectId: string;
  mode: CanvasCaptureMode;
  pageId?: string;
  geometry: CanvasCaptureGeometry;
  scale: number;
}) {
  await assertWebRendererReachable();
  const chrome = await resolveChromePath();
  const token = createRenderToken({
    userId,
    projectId,
    mode,
    ...(pageId ? { pageId } : {}),
    scale,
  });
  const origin = WEB_ORIGIN.replace(/\/+$/, "");
  const url = `${origin}/render/${encodeURIComponent(token)}`;

  return captureRenderedUrl(
    chrome,
    url,
    geometry.width,
    geometry.height,
    scale,
  );
}

interface NodeCaptureResult {
  node: CanvasPageDto;
  width: number;
  height: number;
  scale: number;
  data: string;
  updatedAt: number;
  cacheHit: boolean;
}

async function renderNodeCapture(
  userId: string,
  projectId: string,
  nodeId: string,
  scale: number,
  mode: "page" | "node",
): Promise<NodeCaptureResult> {
  const document = getProjectCanvas(userId, projectId);
  const node = document.pages.find((page) => page.id === nodeId);
  if (!node) {
    throw new ApiError(404, "PAGE_NOT_FOUND", "页面不存在");
  }

  const geometry = resolveCanvasCaptureGeometry(
    document.pages,
    document.links,
    mode,
    nodeId,
  );
  assertScreenshotSize(geometry.width, geometry.height, "页面");

  const clampedScale = clampScale(scale);
  const cacheInput = {
    userId,
    projectId,
    mode,
    pageId: nodeId,
    scale: clampedScale,
    updatedAt: document.updatedAt,
  };
  const cached = getScreenshotCache(cacheInput);
  if (cached) {
    return {
      node,
      width: cached.width,
      height: cached.height,
      scale: clampedScale,
      data: cached.data,
      updatedAt: document.updatedAt,
      cacheHit: true,
    };
  }

  const data = await captureWithWebRenderer({
    userId,
    projectId,
    mode,
    pageId: nodeId,
    geometry,
    scale: clampedScale,
  });
  setScreenshotCache(cacheInput, {
    data,
    width: geometry.width,
    height: geometry.height,
    pageName: node.name,
  });

  return {
    node,
    width: geometry.width,
    height: geometry.height,
    scale: clampedScale,
    data,
    updatedAt: document.updatedAt,
    cacheHit: false,
  };
}

export async function capturePageScreenshot(
  userId: string,
  projectId: string,
  pageId: string,
  scale = 1,
) {
  const result = await renderNodeCapture(
    userId,
    projectId,
    pageId,
    scale,
    "page",
  );
  return {
    pageId,
    pageName: result.node.name,
    width: result.width,
    height: result.height,
    scale: result.scale,
    mimeType: "image/png",
    data: result.data,
    updatedAt: result.updatedAt,
    cacheHit: result.cacheHit,
  };
}

export async function captureNodeScreenshot(
  userId: string,
  projectId: string,
  nodeId: string,
  scale = 1,
) {
  const result = await renderNodeCapture(
    userId,
    projectId,
    nodeId,
    scale,
    "node",
  );
  return {
    projectId,
    nodeId,
    nodeName: result.node.name,
    width: result.width,
    height: result.height,
    scale: result.scale,
    mimeType: "image/png",
    data: result.data,
    updatedAt: result.updatedAt,
    cacheHit: result.cacheHit,
  };
}

export async function captureCanvasScreenshot(
  userId: string,
  projectId: string,
  scale = 1,
) {
  const document = getProjectCanvas(userId, projectId);
  const geometry = resolveCanvasCaptureGeometry(
    document.pages,
    document.links,
    "canvas",
  );
  assertScreenshotSize(geometry.width, geometry.height, "画布");

  const bounds = geometry.bounds;
  if (!bounds) {
    throw new ApiError(
      400,
      "SCREENSHOT_EMPTY_CANVAS",
      "画布没有可截图的页面",
    );
  }

  const clampedScale = clampScale(scale);
  const cacheInput = {
    userId,
    projectId,
    mode: "canvas",
    scale: clampedScale,
    updatedAt: document.updatedAt,
  };
  const cached = getScreenshotCache(cacheInput);
  if (cached) {
    return {
      projectId,
      width: cached.width,
      height: cached.height,
      scale: clampedScale,
      mimeType: "image/png",
      data: cached.data,
      updatedAt: document.updatedAt,
      pageCount: geometry.pageCount ?? 0,
      nodeCount: geometry.nodeCount ?? document.pages.length,
      bounds,
      cacheHit: true,
    };
  }

  const data = await captureWithWebRenderer({
    userId,
    projectId,
    mode: "canvas",
    geometry,
    scale: clampedScale,
  });
  setScreenshotCache(cacheInput, {
    data,
    width: geometry.width,
    height: geometry.height,
    pageCount: geometry.pageCount ?? 0,
    nodeCount: geometry.nodeCount ?? document.pages.length,
    bounds,
  });

  return {
    projectId,
    width: geometry.width,
    height: geometry.height,
    scale: clampedScale,
    mimeType: "image/png",
    data,
    updatedAt: document.updatedAt,
    pageCount: geometry.pageCount ?? 0,
    nodeCount: geometry.nodeCount ?? document.pages.length,
    bounds,
    cacheHit: false,
  };
}
