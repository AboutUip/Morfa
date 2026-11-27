# Morfa 文档中心

本目录是 Morfa 的文档入口与唯一事实来源，覆盖产品、架构、设计、Agent 与开发流程。

> 状态：随项目初始化建立 · 最后更新：2026-11-26
>
> English: [README_en.md](README_en.md)

## 语言与写作约定

- **中文为主、英文为辅**：默认使用简体中文写作。每篇主题文档都有同目录英文版本：`name.md`（中文）+ `name_en.md`（英文）；英文文档中心为 [`README_en.md`](README_en.md)。根目录 README 同样成对：`README.md` + `README_en.md`。
- 代码标识符、API 字段与通用技术术语保留英文，必要时在首次出现处给出中文解释。
- 英文版保留代码块、命令与字面示例原样，因此示例中的中文界面文案、错误消息与提交示例可能仍为中文。
- 文件名使用 kebab-case；一篇文档只讨论一个主题。
- 文档状态使用「草案 / 已确认 / 已废弃」标注；涉及架构取舍时新增 [ADR](decisions/)。
- 中英文冲突时，以中文版本为准。

## 文档导航

| 目录 / 文档 | 内容 | 状态 |
| --- | --- | --- |
| [product/vision.md](product/vision.md) | 产品定位、目标用户、核心价值与产品原则 | 草案 |
| [product/roadmap.md](product/roadmap.md) | 里程碑划分与验收标准 | 草案 |
| [architecture/overview.md](architecture/overview.md) | 系统上下文、组件划分、数据流与跨平台策略 | M1 部分实现 |
| [architecture/realtime.md](architecture/realtime.md) | WebSocket 信封、操作注册、订阅、重连与推送 | 已实现基础 |
| [architecture/frontend.md](architecture/frontend.md) | React 前端结构、开屏与加载、状态与样式 | 部分实现 |
| [architecture/backend.md](architecture/backend.md) | Node.js 服务、认证 API、模块与安全 | M1 部分实现 |
| [architecture/database.md](architecture/database.md) | SQLite 使用约定、迁移流程与表结构 | M1 部分实现 |
| [design/theming.md](design/theming.md) | 深色 / 浅色主题、设计令牌与持久化 | 已实现基础 |
| [design/i18n.md](design/i18n.md) | 语言策略、资源组织与格式化 | 已实现基础 |
| [design/branding.md](design/branding.md) | 标志构成、背景要求、留白与资产清单 | 已建立 |
| [design/typography.md](design/typography.md) | 字体选择、子集策略、性能与使用规则 | 已接入 |
| [design/accessibility.md](design/accessibility.md) | 键盘交互、焦点陷阱、跳过链接与验证 | 已实现基础 |
| [agent/overview.md](agent/overview.md) | Agent 定位、运行生命周期、工具与安全 | 草案 |
| [integrations/mcp.md](integrations/mcp.md) | 原生 MCP 服务、API Key 权限、能力清单与接入方式 | 已实现 |
| [integrations/xaiop.md](integrations/xaiop.md) | XAIOP SDK 的来源、构建、接入方式与验证 | 已内置，业务接入待开始 |
| [guides/development.md](guides/development.md) | 本地环境、命令、分支与提交规范 | 草案 |
| [decisions/](decisions/) | 架构决策记录（ADR），含原生 MCP 与 API Key 权限模型 | 持续更新 |
| [README_en.md](README_en.md) | 英文文档中心（与本文成对） | 已建立 |

### 架构决策记录

- [0001 技术栈](decisions/0001-tech-stack.md)
- [0002 仓库结构](decisions/0002-monorepo.md)
- [0003 主题与 i18n](decisions/0003-theming-and-i18n.md)
- [0004 以 vendored 源码集成 XAIOP](decisions/0004-xaiop-integration.md)
- [0005 账号认证与头像存储](decisions/0005-auth-and-avatar.md)
- [0006 原生 MCP](decisions/0006-native-mcp.md)
- [0007 单 WebSocket 实时通道](decisions/0007-realtime-websocket.md)

## 阅读路径

- **新加入的开发者**：README → 产品愿景 → 架构总览 → 开发指南 → 对应模块文档。
- **产品与设计**：产品愿景 → 路线图 → 主题规范 → i18n 规范。
- **Agent / MCP / 实时方向**：架构总览 → Agent 设计 → MCP 集成 → 实时网络通道 → XAIOP 集成 → 数据库设计（运行记录部分）。
- **第三方依赖维护**：XAIOP 集成 → vendor README → ADR 0004。
- **架构评审**：架构总览 → 各模块文档 → ADR 列表。

## 文档维护

1. 功能或行为变化时，在同一个变更中更新相关文档。
2. 新增架构决策时，在 `decisions/` 下按 `NNNN-title.md` 编号，并在本页与相关文档中链接。
3. 文档中的计划与现状要区分清楚：未实现的内容标注「规划中」，避免被误认为已有能力。
4. 示例代码与命令应可复制执行；暂不可用的命令需明确说明。
