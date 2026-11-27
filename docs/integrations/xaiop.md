# XAIOP 集成

> 状态：SDK 已内置，业务接入待开始 · 最后更新：2026-11-26
>
> English: [xaiop_en.md](xaiop_en.md) · 如中英文版本冲突，以本文为准

XAIOP 是一个行式、游标构建的结构化数据协议：生成方逐行发出构建指令，SDK 确定性地物化 JSON，适合增量输出、分阶段提交与流式解析。Morfa 的 Agent 需要把结构化设计变更增量传给前端，并保留预览、应用、撤销与断点恢复能力，因此把 XAIOP 的 Node.js 与浏览器 SDK 作为**本地源码依赖**引入，而不是依赖 npm registry 上的发布版本。

本文只描述 Morfa 如何内置、编译、验证与使用 XAIOP。协议语法与完整 API 以上游文档为准，见[上游与版本](#上游与版本)。

## 一分钟结论

| 层面 | 当前状态 |
| --- | --- |
| SDK 源码 | 已 vendored 到 `vendor/xaiop/`，随仓库提交 |
| workspace 依赖 | 已通过根 `package.json` 注册为 `@bylan280/xaiop` |
| Vite 自动编译 | 已挂载到 `apps/web/vite.config.ts` |
| 入口与协议冒烟 | 已通过 `npm run xaiop:check` |
| 上游完整测试 | 已通过 `npm run xaiop:test`，901 passed / 0 failed |
| 应用业务代码 import | **尚未开始** |
| 应用 `package.json` 声明 | **尚未声明**，当前依靠根 workspace 提升 |
| Agent 事件映射与端到端测试 | **尚未开始**（随 M3 落地） |

> 结论：现在可以从 `apps/web` 或 `apps/server` 导入 SDK 并完成本地编译，但 Morfa 还没有任何运行时代码真正使用它。`/api/realtime` 是 Morfa 自己的 JSON 信封 WebSocket 通道，**不是** XAIOP 通道，两者不要混淆。

## 上游与版本

| 项 | 值 |
| --- | --- |
| GitHub | <https://github.com/AboutUip/XAIOP> |
| SDK 包名 | `@bylan280/xaiop` |
| SDK 版本 | `0.16.0` |
| 协议版本 | `0.7.0`（Draft） |
| 上游源码提交 | `83dea5a` |
| 同步日期 | 2026-11-25 |
| 许可证 | MIT，见 [`vendor/xaiop/xaiop-sdk/nodejs/LICENSE`](../../vendor/xaiop/xaiop-sdk/nodejs/LICENSE) |
| Node.js 要求 | 上游 `>= 18`；Morfa 仓库统一要求 `>= 22.12` |

上游文档（英文为准）：

- [Node.js SDK API](https://github.com/AboutUip/XAIOP/blob/main/docs/sdk/nodejs/API.md)
- [协议语法](https://github.com/AboutUip/XAIOP/blob/main/docs/protocol/syntax.md)
- [行为契约](https://github.com/AboutUip/XAIOP/blob/main/docs/sdk/behavioral-contract.md)

选择 vendored 源码的理由：

- **可复现**：源码随仓库锁定，不依赖 registry 发布节奏或网络可用性。
- **可审计**：Agent 协议是核心依赖，源码、测试与夹具都可在仓库内直接检查。
- **可修改**：需要适配时可以本地打补丁，并明确记录版本差异。
- **三端一致**：Node、浏览器与同构 core 入口来自同一份源码，减少协议行为差异。

## 仓库布局

```text
vendor/xaiop/
├─ README.md                       # 来源、版本、同步与本地修改策略
├─ xaiop-sdk/
│  ├─ nodejs/                      # @bylan280/xaiop 源码
│  │  ├─ src/
│  │  │  ├─ core/                  # 解析、编码、合并、检查点、类型（无 I/O）
│  │  │  ├─ browser/               # 浏览器入口、流式传输、WebSocket 客户端
│  │  │  └─ node/                  # Node 入口、HTTP/SSE/WS 传输、WS 服务端
│  │  ├─ test/                     # 上游完整测试，保持可运行
│  │  ├─ scripts/
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  └─ conformance/core-wire/       # 上游 Node 测试使用的协议一致性夹具
└─ docs/examples/                  # 上游 Node 测试使用的示例夹具
```

提交与不提交的边界：

- **提交**：SDK 源码、测试、夹具、`package.json`、`tsconfig.json`、许可证与 vendor README。
- **不提交**：`vendor/xaiop/xaiop-sdk/nodejs/dist/`、`*.tgz`、`vendor/**/node_modules/`，均在 `.gitignore` 中。
- **构建产物**：由 `scripts/vite-plugin-xaiop.mjs` 或 `npm run xaiop:build` 按需生成。

本地修改策略：默认保持上游源码原样，便于比对与升级。Morfa 特有的适配代码放在 `apps/*` 或 `packages/shared`，不要直接修改 `vendor/xaiop`；确需修改时，在提交信息与 [`vendor/xaiop/README.md`](../../vendor/xaiop/README.md) 中记录原因。

## 依赖与 workspace

根 `package.json` 通过 npm workspaces 把 SDK 注册为本地包：

```json
{
  "workspaces": [
    "apps/*",
    "packages/*",
    "vendor/xaiop/xaiop-sdk/nodejs"
  ]
}
```

安装后可验证链接关系：

```bash
npm ls @bylan280/xaiop
# morfa@0.1.0
# └── @bylan280/xaiop@0.16.0 -> ./vendor/xaiop/xaiop-sdk/nodejs
```

当前 `apps/web/package.json` 与 `apps/server/package.json` **尚未声明** `@bylan280/xaiop`。在业务代码首次 `import` 前，应在对应应用包中补上：

```json
{
  "dependencies": {
    "@bylan280/xaiop": "0.16.0"
  }
}
```

这样做可以避免长期依赖根 workspace 的依赖提升，也让应用依赖关系更清晰。当前阶段仅做构建校验，因此尚未添加。

## 构建与自动编译

SDK 的 `package.json` 入口指向 `dist/`，而 `dist/` 不提交。Morfa 使用 [`scripts/vite-plugin-xaiop.mjs`](../../scripts/vite-plugin-xaiop.mjs) 在 Vite 启动与构建前检查并按需编译。

### 命令

| 命令 | 行为 |
| --- | --- |
| `npm run xaiop:build` | 执行 `tsc`，把源码编译到 `vendor/xaiop/xaiop-sdk/nodejs/dist` |
| `npm run xaiop:test` | 先编译，再运行上游完整测试（`node test/run-all.mjs`） |
| `npm run xaiop:check` | 确保 `dist` 最新，校验 Node / browser / core 入口并用夹具验证解析结果 |

### Vite 插件行为

1. **启动前检查**：`configResolved` 与 `buildStart` 都会调用 `ensureXaiopBuilt()`。
2. **判断新鲜度**：比较 `src/**/*.ts`（不含 `.d.ts`）、`tsconfig.json`、`package.json` 的最新修改时间与必需产物的最旧修改时间。
3. **必要时重建**：删除 `dist/` 后重新执行 `tsc`，避免残留过期文件。
4. **校验入口**：编译后确认 `index`、`browser/index`、`core/index` 的 `.js` 与 `.d.ts` 都存在；缺失时抛出明确错误，不继续启动。
5. **开发监听**：监听 vendored `src` 的 `add` / `change` / `unlink`，150 ms 防抖后重编译并触发整页刷新。
6. **预构建**：把 `@bylan280/xaiop/browser` 与 `@bylan280/xaiop/core` 加入 `optimizeDeps.include`，确保浏览器入口被 Vite 预构建。
7. **跳过检查**：设置 `XAIOP_SKIP_BUILD=1` 会完全跳过构建与产物检查，仅供已经确认 `dist` 存在且最新的 CI 场景。如果产物缺失，后续导入会在运行时失败。

`apps/web/vite.config.ts` 的挂载方式：

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { xaiopSourcePlugin } from "../../scripts/vite-plugin-xaiop.mjs";

export default defineConfig({
  plugins: [xaiopSourcePlugin(), react()],
});
```

### CI 建议

```bash
npm ci
npm run xaiop:check   # 同时完成按需编译、入口与夹具校验
npm run build
```

- 不要依赖缓存里的 `dist` 一定是最新的；`xaiop:check` 会按修改时间判断并自动重建。
- 首次构建会多等待一次 `tsc`（通常 1–5 秒），之后命中 `dist` 直接复用。
- 若 CI 已显式执行 `npm run xaiop:build`，也不建议设置 `XAIOP_SKIP_BUILD=1`，除非能够保证产物与源码严格同步。

## 使用方式

### 入口选择

| 入口 | 适用环境 | 包含能力 | 不应使用 |
| --- | --- | --- | --- |
| `@bylan280/xaiop` | Node.js / 服务端 | 完整 surface：解析、编码、流式、HTTP/SSE/WS、`XaiopWs.listen` / `connect` | 浏览器打包（会带入 Node 依赖） |
| `@bylan280/xaiop/browser` | 浏览器 | core + `XaiopStream` + 浏览器传输 + `XaiopBrowserWs.connect` | 服务端 `listen` / hub |
| `@bylan280/xaiop/core` | 前后端同构 | 解析、编码、合并、检查点、类型校验，无 I/O | 网络传输与 WebSocket 服务端 |

### 解析与构造

```ts
import { parseSync } from "@bylan280/xaiop/core";

const value = parseSync(wire);
```

`parseSync(source, false)` 默认使用严格模式；第二个参数传 `true` 会开启兼容修正，只适合已知的旧数据或人工调试输入。**不要对模型输出默认开启兼容模式**，否则会把协议错误静默修正掉。

使用内存引擎构造与读取文档：

```ts
import { XaiopEngine } from "@bylan280/xaiop/core";

const engine = new XaiopEngine();
const id = await engine.upload(wire);
const value = await engine.get(id);
```

### 流式消费

浏览器通过 `XaiopStream` 消费增量文本。它支持 `http`、`sse`、`websocket` 与 `raw` 传输：

```ts
import { XaiopStream } from "@bylan280/xaiop/browser";

const stream = new XaiopStream("/api/agent/stream");

stream.on("chunk", (diff, meta) => {
  previewPatch(diff, meta);
});

stream.on("done", (json) => {
  commitPreview(json);
});

stream.on("error", (error) => {
  showProtocolError(error);
});

stream.send();
```

> 上面的 `/api/agent/stream` 是示意地址。Morfa 的 Agent 端点尚未实现，具体路径与事件信封在设计 M3 时确定。

### WebSocket

Node 侧可以启动或连接 XAIOP WebSocket，浏览器侧只提供 `connect`：

```ts
import { XaiopWs } from "@bylan280/xaiop";
import { XaiopBrowserWs } from "@bylan280/xaiop/browser";

const hub = await XaiopWs.listen({ port: 3002, path: "/xaiop" });
const connection = await XaiopBrowserWs.connect("ws://127.0.0.1:3002/xaiop");
```

Morfa 目前没有独立的 XAIOP WebSocket 服务；是否需要复用现有 `/api/realtime` 网关、还是新增专用端点，属于 M3 的接入设计，不在当前集成范围内。

### 在 Morfa 中的边界

- **XAIOP 是编码 / 检查点层，不是传输层。** 它描述如何把结构化值写成可增量解析的文本，不规定必须使用 SSE、WebSocket 还是普通 HTTP。
- **现有 `/api/realtime` 不是 XAIOP。** 它承载 Morfa 自己的 JSON 信封（`v / id / type / module / action / payload`），用于偏好、MCP 能力目录等内部操作；不要把 `XaiopBrowserWs` 直接指向它。
- **Agent 流式传输仍属规划。** 按 [ADR 0007](../decisions/0007-realtime-websocket.md) 与[实时网络通道](../architecture/realtime.md)，后续 Agent 流计划复用单 WebSocket 通道；XAIOP 载荷如何放入实时信封、事件如何映射，尚未设计。
- **服务端负责编码与校验。** 模型输出先经过业务 schema 校验，再编码为 XAIOP；不能把模型输出直接写入设计文档。
- **客户端负责预览与提交。** 解析结果只进入预览层，用户确认后才提交版本；保留 diff、撤销与运行记录。
- **适配代码不要放进 vendor。** Morfa 与 XAIOP 的粘合层放在 `apps/*` 或 `packages/shared`，方便升级与测试。
- **错误映射。** SDK 抛出的 `XaiopSyntaxError`、`XaiopControlError`、`XaiopTypeError` 等应转换为稳定的业务错误码与可翻译文案，不要把内部堆栈直接展示给用户。

规划中的接入点（当前尚未创建）：

| 位置 | 职责 |
| --- | --- |
| `apps/server/src/agent` | Agent 编排、XAIOP 编码、运行记录与事件发布 |
| `packages/shared` | Agent 事件 DTO、载荷 schema、协议版本常量 |
| `apps/web/src/features/agent` | `XaiopStream` / `parseSync` 消费、补丁预览与提交 |

## 验证

本次文档更新时执行：

```bash
npm run xaiop:test
npm run xaiop:check
```

结果：

```text
tests 901
suites 83
pass 901
fail 0

[xaiop] 校验通过：SDK 0.16.0 / 协议 0.7.0（Node / browser / core）
```

`xaiop:check` 覆盖：

- `SDK_VERSION === "0.16.0"`，`PROTOCOL_VERSION === "0.7.0"`；
- Node 入口导出 `XaiopWs`；
- 浏览器入口导出 `XaiopBrowserWs` 与 `XaiopStream`；
- core 入口导出 `parseSync`；
- Node / browser / core 三个入口对 `complex.xaiop` 的解析结果与上游夹具一致；
- `dist` 存在且不早于源码与构建配置。

上游测试覆盖协议语法、编码 / 解析往返、检查点、历史与跳转、控制帧、WebSocket、类型校验、兼容模式与一致性夹具。当前验证只证明 SDK 自身可用，不代表 Morfa 的 Agent 链路已经打通。

## 同步上游

1. 在 XAIOP 仓库检出目标提交，确认 `xaiop-sdk/nodejs`、`xaiop-sdk/conformance/core-wire`、`docs/examples` 没有未提交修改。
2. 复制上述目录到 `vendor/xaiop/`，**不要**复制 `dist/`、`node_modules/`、`*.tgz`。
3. 更新 [`vendor/xaiop/README.md`](../../vendor/xaiop/README.md) 中的版本、提交与同步日期。
4. 如果 SDK 版本变化，更新根 `package.json` 与（未来）应用包中的依赖版本，并重新执行 `npm install` 刷新锁文件；若 vendored package 的 `package-lock.json` 也有变化，一并同步。
5. 运行 `npm run xaiop:test` 与 `npm run xaiop:check`。
6. 若出现破坏性变更，更新本文档、[ADR 0004](../decisions/0004-xaiop-integration.md) 与相关架构文档。
7. 在提交信息中记录上游提交号与测试结果，便于回溯。

协议仍为 Draft，升级时重点检查：WebSocket 控制帧、检查点 / 历史行为、类型校验、兼容模式默认值，以及浏览器入口的导出变化。

## 安全与边界

- **输入不可信**：XAIOP 文本、解析后的 JSON 与 Agent 工具参数都必须按 Morfa 的 schema 再次校验，不能因为 SDK 解析成功就视为合法业务数据。
- **严格模式优先**：对模型输出使用严格解析；兼容模式只用于已知旧数据，并记录启用原因。
- **限制体积与时长**：为单次流设置最大字节数、最大阶段数与超时，防止恶意或失控输出耗尽内存。
- **不执行数据**：解析结果只作为数据使用，不参与 `eval`、SQL 拼接、shell 命令或文件路径构造。
- **密钥隔离**：模型供应商密钥只存在于服务端，不能进入浏览器、XAIOP 流或模型上下文。
- **浏览器最小能力**：浏览器入口不包含服务端 `listen` / hub；不要在浏览器导入 Node 入口。
- **版本锁定**：SDK 与协议均锁定版本；升级前跑完整测试与冒烟，升级后记录差异。

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 首次 `npm run dev` 等待几秒 | 正常，Vite 插件正在编译 `dist`；后续启动会复用 |
| `Cannot find module '@bylan280/xaiop'` | 先执行 `npm install`；用 `npm ls @bylan280/xaiop` 确认链接到 `vendor/...`；确认 `dist` 已生成 |
| `[xaiop] 找不到 TypeScript` | 在仓库根目录执行 `npm install`，不要只安装单个 workspace |
| `[xaiop] TypeScript 编译失败` | 先单独执行 `npm run xaiop:build` 查看完整错误；检查 Node 版本与上游源码是否完整 |
| 修改 SDK 源码后没有生效 | 开发服务器应自动重编译并整页刷新；若未触发，重启 Vite，或删除 `dist` 后执行 `npm run xaiop:build` |
| 浏览器构建报 Node 内置模块错误 | 客户端代码应导入 `@bylan280/xaiop/browser` 或 `/core`，不要导入根入口 |
| `require('@bylan280/xaiop')` 失败 | 包是 ESM（`"type": "module"`，exports 仅提供 `import`），请使用 `import` |
| CI 中提示 `dist` 缺失 | 执行 `npm run xaiop:check` 或 `npm run xaiop:build`；不要在未构建时设置 `XAIOP_SKIP_BUILD=1` |
| `npm run xaiop:test` 较慢 | 首次会先编译再跑 901 个测试；属于预期行为 |

## 已知缺口

以下内容尚未覆盖，后续实现时应同步更新本文档：

- `apps/web` / `apps/server` 的 `package.json` 还没有声明 `@bylan280/xaiop`。
- 业务代码还没有实际 `import` SDK；当前只有构建与冒烟验证。
- Agent 端点、XAIOP 载荷与实时信封的映射、`run.*` / `patch.*` 事件定义尚未实现。
- 没有 Morfa 自己的 XAIOP 集成测试或端到端测试；目前依赖上游测试与 `xaiop:check`。
- 没有针对流式体积、阶段数、超时与断线恢复的业务级限制。
- 没有协议版本升级的自动化检查；升级仍依赖人工同步与测试。

## 相关文档

- [ADR 0004：以 vendored 源码集成 XAIOP](../decisions/0004-xaiop-integration.md)
- [vendor/xaiop/README.md](../../vendor/xaiop/README.md)
- [Agent 设计](../agent/overview.md)
- [实时网络通道](../architecture/realtime.md)
- [后端架构](../architecture/backend.md)
- [前端架构](../architecture/frontend.md)
- [开发指南](../guides/development.md)
- [English version](xaiop_en.md)
