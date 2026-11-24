# Morfa 文档中心

本目录是 Morfa 的文档入口与唯一事实来源，覆盖产品、架构、设计、Agent 与开发流程。

> 状态：随项目初始化建立 · 最后更新：2026-11-25

## 语言与写作约定

- **中文为主、英文为辅**：默认使用简体中文写作；英文文档放在 [`en/`](en/README.md)。
- 代码标识符、API 字段与通用技术术语保留英文，必要时在首次出现处给出中文解释。
- 文件名使用 kebab-case；一篇文档只讨论一个主题。
- 文档状态使用「草案 / 已确认 / 已废弃」标注；涉及架构取舍时新增 [ADR](decisions/)。
- 中英文冲突时，以中文版本为准。

## 文档导航

| 目录 / 文档 | 内容 | 状态 |
| --- | --- | --- |
| [product/vision.md](product/vision.md) | 产品定位、目标用户、核心价值与产品原则 | 草案 |
| [product/roadmap.md](product/roadmap.md) | 里程碑划分与验收标准 | 草案 |
| [architecture/overview.md](architecture/overview.md) | 系统上下文、组件划分、数据流与跨平台策略 | 草案 |
| [architecture/frontend.md](architecture/frontend.md) | React 前端结构、状态管理、样式与模块边界 | 草案 |
| [architecture/backend.md](architecture/backend.md) | Node.js 服务、API 约定、模块与安全 | 草案 |
| [architecture/database.md](architecture/database.md) | SQLite 使用约定、迁移流程与表结构草案 | 草案 |
| [design/theming.md](design/theming.md) | 深色 / 浅色主题、设计令牌与持久化 | 草案 |
| [design/i18n.md](design/i18n.md) | 语言策略、资源组织与格式化 | 草案 |
| [design/branding.md](design/branding.md) | 标志构成、背景要求、留白与资产清单 | 已建立 |
| [agent/overview.md](agent/overview.md) | Agent 定位、运行生命周期、工具与安全 | 草案 |
| [integrations/xaiop.md](integrations/xaiop.md) | XAIOP SDK 的来源、编译、Vite 集成与验证 | 已集成 |
| [guides/development.md](guides/development.md) | 本地环境、命令、分支与提交规范 | 草案 |
| [decisions/](decisions/) | 架构决策记录（ADR） | 持续更新 |
| [en/README.md](en/README.md) | 英文概览与文档索引 | 草案 |

## 阅读路径

- **新加入的开发者**：README → 产品愿景 → 架构总览 → 开发指南 → 对应模块文档。
- **产品与设计**：产品愿景 → 路线图 → 主题规范 → i18n 规范。
- **Agent 方向**：架构总览 → Agent 设计 → XAIOP 集成 → 数据库设计（运行记录部分）。
- **第三方依赖维护**：XAIOP 集成 → vendor README → ADR 0004。
- **架构评审**：架构总览 → 各模块文档 → ADR 列表。

## 文档维护

1. 功能或行为变化时，在同一个变更中更新相关文档。
2. 新增架构决策时，在 `decisions/` 下按 `NNNN-title.md` 编号，并在本页与相关文档中链接。
3. 文档中的计划与现状要区分清楚：未实现的内容标注「规划中」，避免被误认为已有能力。
4. 示例代码与命令应可复制执行；暂不可用的命令需明确说明。
