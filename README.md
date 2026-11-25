<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="branding/logo-mark.png" />
    <img src="branding/logo-badge.png" width="128" alt="Morfa 标志" />
  </picture>
</p>

# Morfa

**AI 驱动的在线 UI 设计平台 · 跨平台 · Agent 驱动**

Morfa 是一个 AI 原生的在线 UI 设计工具。它把自然语言意图与结构化、可编辑的设计文档连接起来：Agent 负责理解与执行，用户始终拥有预览、应用与撤销的控制权。

> 仓库：<https://github.com/AboutUip/Morfa> · XAIOP 上游：<https://github.com/AboutUip/XAIOP>
>
> 当前阶段：**M1 进行中**。Web 工作区已可启动：包含 3 秒启动加载（进度接口可扩展）、Figma 风格工作区骨架、深色 / 浅色主题与中英文切换。后端与编辑器能力待后续里程碑接入。

## 核心方向

- **Agent 驱动**：通过对话完成生成、修改、解释与审查；Agent 的每一步操作都基于类型化工具，过程可追踪、结果可撤销。
- **跨平台**：浏览器优先，适配桌面、平板与触屏设备；同一份设计可在多端访问，桌面客户端列入路线图。
- **原生深色 / 浅色主题**：跟随系统或手动切换，全站由设计令牌驱动，切换无闪烁。
- **原生 i18n**：默认简体中文，内置英文；界面文案、日期与数字格式化统一走国际化层。
- **结构化设计文档**：设计即数据，便于版本化、协作、导出，也便于 Agent 精确操作。
- **自托管友好**：以 SQLite 作为嵌入式数据库，降低本地开发与小型部署的门槛。
- **Agent 流式协议**：集成 [XAIOP](https://github.com/AboutUip/XAIOP) SDK（Node / 浏览器），为结构化增量输出与断线恢复提供基础。

## 当前实现

- **启动加载**：固定 3 秒占位，进度由可组合的 bootstrap 任务驱动；后续替换为网络初始化任务即可展示真实进度。
- **工作区骨架**：顶栏 `logo | Morfa`、页面 / 图层侧栏、画布与属性面板，布局参考 Figma。
- **主题**：`system / light / dark` 三态，首屏无闪烁，顶栏可切换。
- **国际化**：默认简体中文，支持英文切换，界面文案全部来自资源文件。

## 技术栈

| 层次 | 技术选型 | 状态 |
| --- | --- | --- |
| 前端 | React + TypeScript | 已搭建 |
| 前端构建 | Vite | 已接入 |
| 后端 | Node.js + TypeScript | 已选定 |
| 数据库 | SQLite（WAL 模式） | 已选定 |
| Agent 流式协议 | XAIOP SDK `0.16.0`（vendored 源码） | 已集成 |
| 仓库组织 | npm workspaces（monorepo） | 已采用 |
| 测试 | Vitest + Playwright | 建议方案 |

Web 依赖版本已写入 `apps/web/package.json` 与根锁文件；其余依赖将在后续搭建时锁定，并记录到 [技术栈决策](docs/decisions/0001-tech-stack.md)。

## 目录结构

```text
Morfa/
├─ apps/
│  ├─ web/                 # React 前端应用（加载流程 + 工作区骨架）
│  └─ server/              # Node.js API 与 SQLite（待搭建）
├─ packages/
│  └─ shared/              # 跨端共享的类型、契约与常量
├─ branding/               # 标志、徽标与 favicon / app icons
├─ vendor/
│  └─ xaiop/               # XAIOP SDK 源码（Node / 浏览器），dist 不入库
├─ docs/                   # 文档中心（中文为主，英文为辅）
│  ├─ product/             # 产品愿景与路线图
│  ├─ architecture/        # 架构、前端、后端、数据库
│  ├─ design/              # 主题与国际化规范
│  ├─ agent/               # Agent 能力与运行机制
│  ├─ integrations/        # 第三方依赖集成（XAIOP）
│  ├─ guides/              # 开发指南
│  ├─ decisions/           # 架构决策记录（ADR）
│  └─ en/                  # 英文文档
├─ scripts/                # 开发脚本与 Vite 集成插件
├─ README.md
└─ LICENSE
```

各目录的职责与规划见 [文档中心](docs/README.md)。

## 快速开始

```bash
npm install          # 安装所有 workspace 依赖（含 vendored XAIOP）
npm run dev          # 启动 Web 工作区：http://127.0.0.1:5173
npm run build        # 类型检查 + 构建 Web 产物
npm run preview      # 预览生产构建
npm run xaiop:check  # 校验 XAIOP Node / browser / core 入口
```

环境要求：Node.js >= 22、npm >= 10、Git。更多说明见 [开发指南](docs/guides/development.md) 与 [XAIOP 集成文档](docs/integrations/xaiop.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [文档中心](docs/README.md) | 文档导航、阅读路径与写作规范 |
| [产品愿景](docs/product/vision.md) | 产品定位、目标用户与产品原则 |
| [路线图](docs/product/roadmap.md) | 从工程骨架到上线的阶段规划 |
| [架构总览](docs/architecture/overview.md) | 系统组成、数据流与跨平台策略 |
| [前端架构](docs/architecture/frontend.md) | React 应用结构、状态与样式约定 |
| [后端架构](docs/architecture/backend.md) | Node.js 服务、API 与模块划分 |
| [数据库设计](docs/architecture/database.md) | SQLite 约定、迁移与表结构草案 |
| [主题规范](docs/design/theming.md) | 深色 / 浅色主题与设计令牌 |
| [国际化规范](docs/design/i18n.md) | 语言策略、文案组织与格式化 |
| [品牌规范](docs/design/branding.md) | 标志含义、背景使用、留白与资产清单 |
| [Agent 设计](docs/agent/overview.md) | Agent 运行机制、工具与安全边界 |
| [XAIOP 集成](docs/integrations/xaiop.md) | SDK 来源、编译方式与 Vite 按需构建 |
| [开发指南](docs/guides/development.md) | 环境、命令、分支与提交规范 |
| [架构决策](docs/decisions/) | ADR 记录与背景 |

## 语言策略

本项目以**中文为主、英文为辅**：

- 面向团队与用户的文档、提交信息、讨论默认使用中文。
- 代码标识符、API 字段与行业术语保留英文，首次出现时给出中文解释。
- 界面文案全部进入 i18n 资源文件，不在组件中硬编码。
- 英文文档位于 [`docs/en/`](docs/en/README.md)，关键文档提供英文摘要；如中英文冲突，以中文版本为准。

## 开发约定

- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，例如 `feat(editor): 支持画布缩放`、`docs: 补充主题规范`。
- 分支采用短生命周期的 `feat/...`、`fix/...`、`docs/...`，合并前保持历史清晰。
- 架构或技术选型变更需新增 ADR，而不是只改代码。
- 行为变化必须同步更新对应文档与 i18n 资源。

## 第三方组件

| 组件 | 用途 | 来源 | 集成方式 |
| --- | --- | --- | --- |
| XAIOP SDK `0.16.0` | Agent 结构化流式协议（Node / 浏览器） | <https://github.com/AboutUip/XAIOP>（提交 `83dea5a`，MIT） | 源码位于 `vendor/xaiop/`，`dist` 由 Vite 插件按需编译 |

XAIOP 的源码与许可证保留在 `vendor/xaiop/`，编译产物不提交。详见 [XAIOP 集成](docs/integrations/xaiop.md) 与 [ADR 0004](docs/decisions/0004-xaiop-integration.md)。

## 许可证

[MIT](LICENSE) © 2026 小萱baibai

---

## English

Morfa is an AI-powered, cross-platform online UI design platform. Agents operate on structured, editable design documents, while users keep full control through preview, apply, and undo.

**Status:** project initialization. This repository currently contains the directory layout, architecture decisions, and documentation skeleton; application code will follow.

**Stack:** React + TypeScript (web), Node.js + TypeScript (server), SQLite (database), npm workspaces (monorepo).

**XAIOP:** the [XAIOP](https://github.com/AboutUip/XAIOP) SDK (upstream commit `83dea5a`, MIT) is vendored under `vendor/xaiop/` for structured streaming between the Agent and the editor. Only source is committed; `dist` is compiled on demand by a Vite plugin. See [`docs/integrations/xaiop.md`](docs/integrations/xaiop.md).

Chinese is the primary language of this project. English documentation is available in [`docs/en/`](docs/en/README.md); when the two differ, the Chinese version is authoritative.
