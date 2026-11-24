# XAIOP 集成

> 状态：已集成（SDK `0.16.0` / 协议 `0.7.0` Draft）· 最后更新：2026-11-25

## 背景

Morfa 的 Agent 需要把结构化设计变更以流式方式传给前端，并支持分阶段提交、断线恢复与工具调用记录。XAIOP 是一个行式、游标构建的结构化数据协议：生成方逐行发出构建指令，SDK 确定性地物化 JSON，天然适合增量输出与流式解析。

本次集成把 XAIOP 的 Node.js 与浏览器 SDK 作为**本地源码依赖**引入，锁定上游提交，避免依赖 npm registry 上的发布节奏。

## 上游信息

| 项 | 值 |
| --- | --- |
| GitHub | <https://github.com/AboutUip/XAIOP> |
| SDK 包名 | `@bylan280/xaiop` |
| SDK 版本 | `0.16.0` |
| 协议版本 | `0.7.0`（Draft） |
| 源码提交 | `83dea5a` |
| 许可证 | MIT |
| 同步日期 | 2026-11-25 |

上游文档（英文为准）：

- [Node.js SDK API](https://github.com/AboutUip/XAIOP/blob/main/docs/sdk/nodejs/API.md)
- [协议语法](https://github.com/AboutUip/XAIOP/blob/main/docs/protocol/syntax.md)
- [行为契约](https://github.com/AboutUip/XAIOP/blob/main/docs/sdk/behavioral-contract.md)

## 仓库布局

```text
vendor/xaiop/
├─ README.md                       # 来源、版本、同步与构建说明
├─ xaiop-sdk/
│  ├─ nodejs/                      # SDK 源码（src / test / scripts / 配置）
│  └─ conformance/core-wire/       # 上游 Node 测试使用的协议夹具
└─ docs/examples/                  # 上游 Node 测试使用的示例夹具
```

- 保留完整上游源码与测试，测试文件可直接运行。
- **不提交** `dist/`、`node_modules/`、`*.tgz`；这些由安装或 Vite 按需生成。
- 根 `package.json` 通过 npm workspaces 把 `vendor/xaiop/xaiop-sdk/nodejs` 注册为 `@bylan280/xaiop`，其他 workspace 导入该包时会链接到本地源码。

```json
{
  "workspaces": [
    "apps/*",
    "packages/*",
    "vendor/xaiop/xaiop-sdk/nodejs"
  ]
}
```

> 后续创建 `apps/web` / `apps/server` 时，在各自 `package.json` 中声明 `"@bylan280/xaiop": "0.16.0"`，npm 会解析到本地 workspace，而不会下载 registry 版本。

## 编译与自动构建

SDK 的 `package.json` 入口指向 `dist/`。由于 `dist/` 不提交，Morfa 使用 [`scripts/vite-plugin-xaiop.mjs`](../../scripts/vite-plugin-xaiop.mjs) 在 Vite 启动前检查并按需编译。

插件行为：

1. `configResolved` / `buildStart`：检查 `dist` 是否存在 Node、browser、core 三类入口及 `.d.ts`。
2. 比较 `src/**/*.ts`、`tsconfig.json`、`package.json` 与产物的修改时间；过期或缺失时执行 `tsc`。
3. 开发服务器监听 vendored `src`，变更后重新编译并整页刷新。
4. 编译完成后再次校验必需入口；失败时抛出明确错误，不继续启动。
5. 设置 `XAIOP_SKIP_BUILD=1` 可跳过检查，仅供已确认 `dist` 存在的 CI 场景。

未来 `apps/web/vite.config.ts` 的接入方式：

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { xaiopSourcePlugin } from "../../scripts/vite-plugin-xaiop.mjs";

export default defineConfig({
  plugins: [xaiopSourcePlugin(), react()],
});
```

插件同时把 `@bylan280/xaiop/browser` 与 `@bylan280/xaiop/core` 加入 `optimizeDeps.include`，确保浏览器入口被正确预构建。

## 使用方式

### 浏览器

```ts
import { XaiopStream, XaiopBrowserWs } from "@bylan280/xaiop/browser";
```

浏览器入口只包含客户端能力：相位流、fetch/SSE/原生 WebSocket，以及 `XaiopBrowserWs.connect`。不包含 Node 的 `listen` / hub。

### Node.js

```ts
import { XaiopEngine, XaiopWs, parseSync } from "@bylan280/xaiop";
```

Node 入口包含完整能力：解析、编码、流、WebSocket 服务端与客户端、历史、控制根等。

### 同构核心

```ts
import { parseSync, DotCheckpointEngine } from "@bylan280/xaiop/core";
```

核心入口不依赖 Node I/O，适合前后端共享解析与校验逻辑。

## 验证结果

本次集成已执行：

```bash
npm install
npm run xaiop:build     # tsc -> dist
npm run xaiop:test      # 上游完整测试：901 passed / 0 failed
npm run xaiop:check     # Node / browser / core 入口 + 夹具解析校验
```

`xaiop:check` 会验证：

- `SDK_VERSION === "0.16.0"`，`PROTOCOL_VERSION === "0.7.0"`；
- Node 入口导出 `XaiopWs`；
- 浏览器入口导出 `XaiopBrowserWs`、`XaiopStream`；
- 三个入口对 `complex.xaiop` 的解析结果与上游夹具一致。

另外使用 Vite 8 对最小页面执行过真实构建：删除 `dist` 后启动构建，插件自动完成编译，browser 入口成功打包进产物。

## 同步上游

1. 在 XAIOP 仓库检出目标提交，确认 `xaiop-sdk/nodejs`、`xaiop-sdk/conformance/core-wire`、`docs/examples` 无未提交修改。
2. 同步复制源码、测试与夹具，**排除** `dist/`、`node_modules/`、`*.tgz`。
3. 更新 [`vendor/xaiop/README.md`](../../vendor/xaiop/README.md) 中的版本、提交与日期。
4. 运行 `npm install`、`npm run xaiop:test`、`npm run xaiop:check`。
5. 若出现破坏性变更，更新本文件与 [ADR 0004](../decisions/0004-xaiop-integration.md)。

## 安全与边界

- XAIOP 输入视为不可信数据；解析前或应用补丁前仍需按 Morfa 的设计文档 schema 做业务校验。
- 协议默认不做静默修复（严格模式），避免 Agent 输出错误被悄悄接受。
- 浏览器端不暴露服务端 listen/hub 能力；模型密钥与数据库凭据不得进入前端。
- 升级 SDK 时重点检查 WebSocket、控制根与解析行为的兼容性。

## 已知限制

- 当前仓库尚未创建 `apps/web`，插件已就绪但还未挂载到实际 Vite 配置；M1 搭建前端时接入。
- 首次启动 Vite 会等待一次 TypeScript 编译（约 1–5 秒），之后命中 `dist` 直接复用。
- 上游发布版本为 `0.15.1`，本地源码为 `0.16.0`；以 vendored 源码为准，不混用 registry 包。
