<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding/logo-mark.png" />
    <img src="branding/logo-badge.png" width="128" alt="Morfa 标志" />
  </picture>
</p>

# Morfa

**AI 驱动的在线 UI 设计平台 · 跨平台 · Agent 驱动**

> 中文 · [English](README_en.md)

Morfa 是一个 AI 原生的在线 UI 设计工具。它把自然语言意图与结构化、可编辑的设计文档连接起来：Agent 负责理解与执行，用户始终拥有预览、应用与撤销的控制权。

> 仓库：<https://github.com/AboutUip/Morfa> · XAIOP 上游：<https://github.com/AboutUip/XAIOP>
>
> 当前阶段：**M1 进行中**。已可启动 Web + API：开屏动画与可复用加载界面、项目主页、账号注册 / 登录、VCode 验证、个人资料编辑、AI 模型供应商配置与模型测试、原生 MCP 服务与 API Key、单 WebSocket 实时通道、加密数据导出与注册时导入、深色 / 浅色主题与中英文切换。编辑器与项目创建能力待后续里程碑接入。

## 核心方向

- **Agent 驱动**：通过对话完成生成、修改、解释与审查；Agent 的每一步操作都基于类型化工具，过程可追踪、结果可撤销。
- **跨平台**：浏览器优先，适配桌面、平板与触屏设备；同一份设计可在多端访问，桌面客户端列入路线图。
- **原生深色 / 浅色主题**：跟随系统或手动切换，全站由设计令牌驱动，切换无闪烁。
- **原生 i18n**：默认简体中文，内置英文；界面文案、日期与数字格式化统一走国际化层。
- **结构化设计文档**：设计即数据，便于版本化、协作、导出，也便于 Agent 精确操作。
- **自托管友好**：以 SQLite 作为嵌入式数据库，降低本地开发与小型部署的门槛。
- **Agent 流式协议**：集成 [XAIOP](https://github.com/AboutUip/XAIOP) SDK（Node / 浏览器），为结构化增量输出与断线恢复提供基础。

## 当前实现

- **开屏动画**：进入页面后 Logo 快速在屏幕中心出现，播放金属打击音效，Logo 在声音中左移，右侧以遮罩动画出现 `|` 与 `Morfa` 字标，随后开屏淡出。主页面先渲染在开屏背后，淡出时只移除遮罩，不等待新的页面切换。可复用的 `LoadingScreen` / `LoadingOverlay` 继续保留给后续异步流程使用。
- **项目主页**：顶栏 `logo | Morfa` 与「项目 | 组件 | 设置」切换 Tab；移动端折叠为左上角 Logo 下拉菜单，箭头提示展开状态；项目区域默认空状态，右上角提供登录入口。组件与设置暂为占位页。
- **账号系统**：登录 / 注册弹窗（仅关闭按钮退出，点击蒙版不关闭），支持头像、昵称、登录账号、密码、确认密码与必选 6 位 VCode；注册时可选择导入原账号数据包，成功后自动登录。
- **VCode 验证**：独立 3×4 数字键盘弹窗，输入 6 位自动确认；用于数据导出、注销账号、忘记密码与查看模型 API Key；已有用户缺少 VCode 时自动登出，登录后引导设置。
- **个人面板**：桌面端点击头像打开相对屏幕居中的双列面板；移动端为全屏面板，顶部横向「个人 / 账号 / 模型 / API」Tab、底部退出登录。个人页可改头像、昵称、密码（新密码单输入 + 旧密码验证弹窗），账号页可导出加密数据包与注销账号（密码验证 → VCode 串行）。模型页可创建 OpenAI / Anthropic 供应商，服务端自动拉取模型并收纳在供应商卡片内；每个模型可发起真实调用测试（支持流式与思考过程展示），也可编辑流式、思考与多模态能力；API Key 加密存储且查看时必须验证 VCode。API 页可创建带 VCode / 密码权限的 MCP API Key，查看端点、下载 `llms.txt`，并搜索与展开全部 MCP 能力。
- **原生 MCP**：`POST /mcp` 提供 JSON-RPC 2.0 能力，支持修改语言 / 主题 / 头像 / 昵称 / 密码、创建导出包、注销账号，以及模型供应商添加、刷新、能力配置、真实测试、查看 Key 与删除。MCP 总控统一注册能力、校验 API Key 权限并生成 `llms.txt`；敏感能力要求调用时传入 VCode / 密码，同时需要两项的能力要求 Key 同时开启两项权限。
- **实时通道**：每个页面一条 WebSocket，统一信封区分模块与操作；高频请求、订阅与服务器推送走实时通道，一次性、文件、敏感操作和公开 MCP 继续走 HTTP。语言 / 主题通过 `preferences.changed` 推送，MCP 能力目录也优先通过实时通道读取。
- **数据导出 / 导入**：服务端使用 AES-256-GCM 加密并 gzip 压缩项目数据；同一用户仅保留一个有效导出包，新导出覆盖旧包；导入仅在注册时提供，要求原账号已注销、数据包未消费，服务端解密导入后吊销数据包。
- **存储与安全**：SQLite 保存用户、会话、VCode 哈希、导出、项目、模型供应商、偏好与 API Key 数据；登录账号唯一且大小写不敏感；密码与 VCode 均使用 scrypt 哈希；导出主密钥保存在服务器；头像文件写入磁盘，数据库只保存相对路径。
- **移动端 / 桌面端**：同一套 React 应用响应式适配；安全区、`100dvh`、移动端底部抽屉、16px 表单输入与 44px 触控目标；提供 PWA manifest 与图标。
- **字体**：Maple Mono CN，等宽、中英文覆盖、无衬线、圆角柔和；使用 GB2312 一级字与 UI 字符子集，附带 OFL 许可证。
- **键盘无障碍**：跳过链接、Tab 方向键、语言菜单键盘操作、弹窗焦点陷阱与关闭后焦点恢复。
- **主题**：`system / light / dark` 三态，首屏无闪烁，顶栏可切换。
- **国际化**：默认简体中文，顶栏通过「地球图标 + 当前语言」下拉切换英文，界面文案全部来自资源文件。

## 技术栈

| 层次 | 技术选型 | 状态 |
| --- | --- | --- |
| 前端 | React + TypeScript | 已搭建 |
| 前端构建 | Vite | 已接入 |
| 后端 | Node.js + TypeScript + Fastify | 已搭建（认证、模型、MCP 与实时通道） |
| 实时通道 | WebSocket + `@fastify/websocket` | 已接入基础层 |
| 数据库 | SQLite（WAL 模式，node:sqlite） | 已接入（认证、VCode、导出、项目、模型供应商、偏好与 API Key） |
| Agent 流式协议 | XAIOP SDK `0.16.0`（vendored 源码） | 已内置，业务接入待开始 |
| 仓库组织 | npm workspaces（monorepo） | 已采用 |
| 测试 | Vitest + Playwright | 建议方案 |

Web 依赖版本已写入 `apps/web/package.json` 与根锁文件；其余依赖将在后续搭建时锁定，并记录到 [技术栈决策](docs/decisions/0001-tech-stack.md)。

## 目录结构

```text
Morfa/
├─ apps/
│  ├─ web/                 # React 前端（项目页、账号、模型与 API 面板）
│  └─ server/              # Fastify API、SQLite、MCP 总控与文件存储
├─ packages/
│  └─ shared/              # 跨端共享的类型、契约与常量
├─ branding/               # 标志、徽标与 favicon / app icons
├─ vendor/
│  └─ xaiop/               # XAIOP SDK 源码（Node / 浏览器），dist 不入库
├─ docs/                   # 文档中心（中文原文 + 同目录 _en.md 英文版）
│  ├─ product/             # 产品愿景与路线图
│  ├─ architecture/        # 架构、前端、后端、数据库
│  ├─ design/              # 主题与国际化规范
│  ├─ agent/               # Agent 能力与运行机制
│  ├─ integrations/        # MCP 与第三方依赖集成
│  ├─ guides/              # 开发指南
│  └─ decisions/           # 架构决策记录（ADR）
├─ scripts/                # 开发脚本与 Vite 集成插件
├─ README.md
├─ README_en.md
└─ LICENSE
```

各目录的职责与规划见 [文档中心](docs/README.md)。

## 快速开始

```bash
npm install          # 安装所有 workspace 依赖（含 vendored XAIOP）
npm run dev          # 启动 Web + API：http://127.0.0.1:5173（API: 3001）
npm run build        # 类型检查 + 构建 Web 产物
npm run preview      # 预览生产构建
npm run xaiop:check  # 校验 XAIOP Node / browser / core 入口
```

环境要求：Node.js >= 22.12、npm >= 10、Git。更多说明见 [开发指南](docs/guides/development.md) 与 [XAIOP 集成文档](docs/integrations/xaiop.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [文档中心](docs/README.md) | 文档导航、阅读路径与写作规范 |
| [产品愿景](docs/product/vision.md) | 产品定位、目标用户与产品原则 |
| [路线图](docs/product/roadmap.md) | 从工程骨架到上线的阶段规划 |
| [架构总览](docs/architecture/overview.md) | 系统组成、数据流与跨平台策略 |
| [实时网络通道](docs/architecture/realtime.md) | WebSocket 信封、操作注册、订阅、重连与推送 |
| [前端架构](docs/architecture/frontend.md) | React 应用结构、状态与样式约定 |
| [后端架构](docs/architecture/backend.md) | Node.js 服务、API 与模块划分 |
| [数据库设计](docs/architecture/database.md) | SQLite 约定、迁移与表结构草案 |
| [主题规范](docs/design/theming.md) | 深色 / 浅色主题与设计令牌 |
| [国际化规范](docs/design/i18n.md) | 语言策略、文案组织与格式化 |
| [品牌规范](docs/design/branding.md) | 标志含义、背景使用、留白与资产清单 |
| [字体规范](docs/design/typography.md) | Maple Mono CN 的选型、子集与使用规则 |
| [键盘与可访问性](docs/design/accessibility.md) | 焦点顺序、键盘操作与弹窗焦点管理 |
| [Agent 设计](docs/agent/overview.md) | Agent 运行机制、工具与安全边界 |
| [MCP 集成](docs/integrations/mcp.md) | 原生 MCP 服务、API Key 权限、能力清单与调用方式 |
| [XAIOP 集成](docs/integrations/xaiop.md) | SDK 来源、构建、接入方式与验证 |
| [开发指南](docs/guides/development.md) | 环境、命令、分支与提交规范 |
| [架构决策](docs/decisions/) | ADR 记录与背景 |

> 每篇文档都有同目录英文版 `name_en.md`；英文文档中心：[docs/README_en.md](docs/README_en.md)。

## 语言策略

本项目以**中文为主、英文为辅**：

- 面向团队与用户的文档、提交信息、讨论默认使用中文。
- 代码标识符、API 字段与行业术语保留英文，首次出现时给出中文解释。
- 界面文案全部进入 i18n 资源文件，不在组件中硬编码。
- 每篇主题文档都有同目录英文版本：`name.md` 为中文原文，`name_en.md` 为英文版本；英文文档中心位于 [`docs/README_en.md`](docs/README_en.md)，根 README 的英文版为 [`README_en.md`](README_en.md)。如中英文冲突，以中文版本为准。

## 开发约定

- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，例如 `feat(editor): 支持画布缩放`、`docs: 补充主题规范`。
- 分支采用短生命周期的 `feat/...`、`fix/...`、`docs/...`，合并前保持历史清晰。
- 架构或技术选型变更需新增 ADR，而不是只改代码。
- 行为变化必须同步更新对应文档与 i18n 资源。

## 第三方组件

| 组件 | 用途 | 来源 | 集成方式 |
| --- | --- | --- | --- |
| XAIOP SDK `0.16.0` | Agent 结构化流式协议（Node / 浏览器） | <https://github.com/AboutUip/XAIOP>（提交 `83dea5a`，MIT） | 源码位于 `vendor/xaiop/`，`dist` 由 Vite 插件按需编译 |
| Maple Mono CN `7.9` | 中英文等宽界面字体 | <https://github.com/subframe7536/maple-font>（OFL-1.1） | 子集 WOFF2 位于 `apps/web/src/assets/fonts/maple-mono/`，附 `OFL.txt` |

XAIOP 的源码与许可证保留在 `vendor/xaiop/`，编译产物不提交。详见 [XAIOP 集成](docs/integrations/xaiop.md) 与 [ADR 0004](docs/decisions/0004-xaiop-integration.md)。

## 许可证

[MIT](LICENSE) © 2026 小萱baibai
