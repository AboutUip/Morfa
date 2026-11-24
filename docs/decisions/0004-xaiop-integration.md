# ADR 0004：以 vendored 源码集成 XAIOP

- 状态：已接受
- 日期：2026-11-25
- 决策者：项目维护者

## 背景

Morfa 的 Agent 需要流式输出结构化设计变更。XAIOP 提供行式游标构建协议与 Node.js / 浏览器 / 同构核心 SDK，适合增量解析、相位提交与断线恢复。

引入方式需要满足：

- 以本地源码为准，便于审计、修改与锁定版本；
- 同时支持 Node.js 服务端与浏览器客户端；
- 不把编译产物提交进仓库；
- 开发与构建时自动准备 SDK，不要求手动执行额外步骤；
- 明确标注上游 GitHub 仓库与许可证。

## 决策

1. **Vendoring**：把上游 `xaiop-sdk/nodejs` 源码、Node 测试所需的 `conformance/core-wire` 与 `docs/examples` 夹具复制到 `vendor/xaiop/`，保留目录层级以便测试直接运行。
2. **版本锁定**：记录上游仓库、SDK `0.16.0`、协议 `0.7.0`、提交 `83dea5a` 与 MIT 许可证。
3. **依赖方式**：根 `package.json` 使用 npm workspaces 将 `vendor/xaiop/xaiop-sdk/nodejs` 注册为 `@bylan280/xaiop`；应用导入该包名，解析到本地源码。
4. **构建产物**：`dist/`、`*.tgz`、`node_modules/` 加入 `.gitignore`，仓库只保留源码、测试与夹具。
5. **按需编译**：新增 `scripts/vite-plugin-xaiop.mjs`，在 Vite 启动/构建前检查并编译 SDK，开发期间监听源码变化自动重建；另提供 `npm run xaiop:check` 做入口与协议冒烟验证。
6. **归属标注**：`vendor/xaiop/README.md`、根 README 与集成文档均标注 XAIOP 的 GitHub 地址、版本与许可证；根 `package.json` 同时标注 Morfa 自身仓库地址。

## 理由

- **可复现**：源码随仓库锁定，不受 registry 发布或网络影响。
- **可审计**：Agent 相关协议是核心依赖，源码可见、测试可跑。
- **类型与浏览器支持**：同一包提供 Node、browser、core 三个入口，避免维护两套依赖。
- **仓库干净**：编译产物可重建，不提交 1 MB 以上的 `dist` 与 source map。
- **开发体验**：Vite 插件把编译前移，避免出现「包存在但入口缺失」的运行时错误。

## 后果

正面：

- 首次启动自动编译，之后按修改时间复用产物。
- 上游完整测试可在本仓库直接运行，升级时有回归保障。
- 浏览器与 Node 入口使用同一版本，减少协议行为差异。

负面 / 限制：

- 上游源码进入仓库，体积增加（当前约 830 KB）。
- 升级需要手动同步源码与夹具，并更新版本记录。
- Vite 插件需要维护与上游构建方式的同步（目前仅 `tsc`）。
- `dist` 缺失时首次启动会多等待一次编译。

## 备选方案

| 方案 | 未采用原因 |
| --- | --- |
| 直接依赖 npm `@bylan280/xaiop@0.15.1` | 发布版本落后于本地源码；无法锁定上游提交与修改 |
| git submodule | 需要额外初始化步骤，CI 与克隆体验更复杂；本地修改与审查不便 |
| 只提交编译后的 `dist` | 违背「保留源码、排除编译依赖」的要求，且难以审计 |
| 每次手动执行 `npm run build` | 容易遗漏；用户明确要求由 Vite 检查并按需编译 |

## 后续动作

- M1 创建 `apps/web` 时挂载 `xaiopSourcePlugin()`，并在依赖中声明 `@bylan280/xaiop`。
- 当 Agent 事件流落地时，补充「XAIOP 事件映射」文档与端到端测试。
- 升级 XAIOP 后记录新的提交号与测试结果。
