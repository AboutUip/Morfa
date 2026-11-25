# 开发指南

> 状态：草案 · 最后更新：2026-11-25

## 环境要求

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | >= 22.12（建议当前 LTS） | 使用 `node --version` 检查 |
| npm | >= 10 | 随 Node.js 安装，项目使用 npm workspaces |
| Git | 最新稳定版 | 提交前确认换行符配置 |
| SQLite | 由依赖内置 | 无需单独安装命令行工具 |

支持 Windows、macOS 与 Linux。脚本应保持跨平台，不依赖 bash 专属命令。

## 当前状态

仓库处于 M1：Web 项目页、3 秒启动加载、账号注册 / 登录与认证 API 已可用；项目创建、编辑器与 Agent 能力仍待接入。

### 已可用命令

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装所有 workspace 依赖（含 vendored XAIOP） |
| `npm run dev` | 并行启动 Web 与 API（`5173` / `3001`） |
| `npm run dev:web` | 仅启动前端 |
| `npm run dev:server` | 仅启动后端（`tsx watch`） |
| `npm run build` | Web 构建 + 服务端类型检查 |
| `npm run preview` | 预览 Web 生产构建 |
| `npm run typecheck` | Web 与服务端 TypeScript 检查 |
| `npm run xaiop:build` | 编译 XAIOP SDK 到 `vendor/xaiop/.../dist` |
| `npm run xaiop:test` | 编译并运行 XAIOP 上游完整测试 |
| `npm run xaiop:check` | 校验 Node / browser / core 入口与夹具解析 |

### M1 剩余命令

| 命令 | 作用 |
| --- | --- |
| `npm run lint` | 代码检查 |
| `npm run format` | 格式化 |
| `npm run test` | 单元与集成测试 |
| `npm run test:e2e` | Playwright 端到端测试 |
| `npm run db:migrate` | 独立的迁移命令（当前服务启动时自动迁移） |

命令落地后，本表与根 `package.json` 必须保持一致。

## 首次设置

```bash
git clone https://github.com/AboutUip/Morfa.git Morfa
cd Morfa
npm install
npm run dev
```

打开 <http://127.0.0.1:5173>，应看到 3 秒启动加载后进入项目页。API 默认运行在 `127.0.0.1:3001`。

- SQLite 数据库位于 `apps/server/data/morfa.sqlite`（不提交），服务启动时自动执行迁移。
- 头像文件位于 `apps/server/data/uploads/avatars/`，数据库只保存相对路径。
- 当前无需 `.env`；需要覆盖端口或数据目录时可设置 `PORT`、`HOST`、`DATA_DIR`、`DATABASE_PATH`。

## 启动与加载流程

Web 端启动流程位于 `apps/web/src/features/bootstrap/`：

- `bootstrap.ts`：定义 `BootstrapTask`，按权重汇总各任务的 `report(0..1)` 进度；当前只有一个 3 秒占位任务。
- `useBootstrap.ts`：负责 React 生命周期、取消、错误状态与重试。
- `LoadingScreen.tsx`：显示进度、当前任务文案、百分比与错误界面。

接入真实网络初始化时，将 `workspaceBootstrapTasks` 替换为会话、项目、设计文档等任务即可，加载界面与汇总逻辑无需修改。当前占位任务固定 3 秒后完成，随后进入项目页。

## XAIOP SDK

XAIOP 以源码形式放在 `vendor/xaiop/`，通过 npm workspaces 注册为 `@bylan280/xaiop`，编译产物 `dist/` 不提交。

- 修改或同步 SDK 源码后执行 `npm run xaiop:test` 与 `npm run xaiop:check`。
- 不要在 `vendor/xaiop` 内提交 `dist/`、`*.tgz` 或 `node_modules/`。
- 前端 Vite 配置需要挂载 `xaiopSourcePlugin()`；插件会自动检查并编译。
- 需要临时跳过自动构建时设置 `XAIOP_SKIP_BUILD=1`，仅限已确认 `dist` 存在的场景。
- 上游信息、同步步骤与安全边界见 [XAIOP 集成](../integrations/xaiop.md)。

## 环境变量

- 本地配置放在根目录或各应用的 `.env`，不提交。
- 所有变量在 `.env.example` 中列出并注明用途与默认值。
- 密钥仅通过环境变量注入，禁止写入源码、文档或提交历史。
- 启动时校验必需变量，缺失时给出明确错误。

## 目录与命名

- 目录与文件名使用 kebab-case（如 `agent-panel`、`design-document.ts`）。
- React 组件使用 PascalCase 文件名（如 `ThemeSwitcher.tsx`），与所在目录风格保持一致。
- 共享类型放在 `packages/shared`，通过包名导入，禁止相对路径穿透 workspace。
- 测试文件与被测文件同目录，命名为 `*.test.ts` / `*.test.tsx`。
- SQL 迁移使用 `NNNN_short-name.sql`。

## 代码风格

- TypeScript 开启 `strict`，避免 `any`；确需使用时说明原因。
- 优先函数式组件与 hooks；组件保持单一职责。
- 纯逻辑抽离到 `lib` 或 `services`，便于单元测试。
- 错误处理显式化：不要吞掉异常，面向用户的错误需可翻译。
- 注释解释「为什么」，不复述代码；公共 API 与复杂算法补充说明。
- 格式化与 Lint 由工具自动完成，不手工争论格式。

## 分支与提交

- 采用 trunk-based 开发，`main` 保持可构建。
- 短生命周期分支：`feat/agent-panel`、`fix/theme-flash`、`docs/i18n-guide`、`chore/workspace-setup`。
- 提交信息遵循 Conventional Commits，主题使用中文：

```text
feat(editor): 支持画布缩放与平移
fix(theme): 修复刷新时深色主题闪白
docs(agent): 补充工具权限边界
chore: 初始化 npm workspaces
```

- 一个提交只做一件事；格式化与逻辑变更分开提交。
- 合并前自行 rebase，保持线性历史；不强制要求，但避免无意义的 merge 提交。

## 变更流程

1. 先读相关文档与 ADR，确认约束。
2. 小步实现，配套测试。
3. 更新受影响的文档、i18n 资源与 `.env.example`。
4. 本地执行 `lint`、`test`、`build`（M1 后可用）。
5. 提交 PR，说明动机、方案、验证方式与截图（涉及 UI 时）。

## 文档要求

- 行为、接口、数据结构变化必须同步文档。
- 新增架构决策时写 ADR，并在 [文档中心](../README.md) 中登记。
- UI 文案必须同时提供 `zh-CN` 与 `en-US`，缺一不可。
- 新增主题令牌时同时提供两套主题取值，并更新主题规范。

## 数据库变更

- 迁移文件只增不改，已合并的迁移不得编辑。
- 提交前在空库与含数据的库上各执行一次。
- 破坏性变更（删列、改类型）需提供数据迁移与回滚说明。
- 生产迁移前备份，参见 [数据库设计](../architecture/database.md)。

## Windows 注意事项

- 仓库通过 `.gitattributes` 统一为 LF；如遇换行符告警，执行 `git add --renormalize .`。
- npm 脚本避免使用 `rm -rf`、`cp` 等 Unix 命令，使用 Node 脚本或跨平台工具。
- 路径大小写敏感差异可能导致导入失败，导入路径保持与实际文件名一致。

## 常见问题

- **`npm install` 失败**：确认 Node.js 与 npm 版本满足要求，清理 `node_modules` 后重试。
- **SQLite 文件被锁定**：关闭占用数据库的进程；确认启用了 WAL 与正确的 `busy_timeout`。
- **深色主题闪烁**：检查 `<head>` 内联初始化脚本是否在样式加载前执行。
- **语言未切换**：检查 `localStorage` 中的 `morfa.locale`、`<html lang>` 与 i18n 初始化顺序。

> 本节随实现补充。遇到问题先查文档，再补充到这里，避免重复排查。
