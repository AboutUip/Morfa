# ADR 0002：Monorepo 与目录结构

> English: [0002-monorepo_en.md](0002-monorepo_en.md)

- 状态：已接受
- 日期：2026-11-25
- 决策者：项目维护者

## 背景

项目同时包含 React 前端、Node.js 后端、共享类型与大量文档。需要：

- 前后端共享设计文档 schema 与 API 契约；
- 统一的提交、测试与文档入口；
- 为桌面客户端、移动端或独立服务预留扩展空间；
- 保持结构直观，避免过度工程化。

## 决策

采用单仓库，按应用与共享包划分：

```text
apps/
├─ web/        React 前端
└─ server/     Node.js API 与 SQLite
packages/
└─ shared/     共享类型、schema、常量
docs/          产品、架构、设计、Agent、ADR
scripts/       开发与运维脚本
```

- 使用 npm workspaces 管理依赖与脚本。
- `apps/web`、`apps/server`、`packages/shared` 各自拥有独立的 `package.json` 与类型配置。
- 未来应用（如 `apps/desktop`）直接加入 `apps/`，共享逻辑下沉到 `packages/`。
- 文档与代码同仓库，变更时一起提交。
- 暂不引入 Nx、Turborepo 等编排工具，出现构建瓶颈后再评估。

## 理由

- 共享契约是本项目的高频需求（设计文档 schema、Agent 工具协议、API DTO），单仓库能显著降低同步成本。
- 目录按「可部署单元（apps）/ 可复用单元（packages）」划分，边界清晰。
- 不使用过深的抽象层，初期开发效率更高。

## 后果

正面：

- 一次提交即可完成「契约 + 前后端 + 文档」的联动变更。
- 统一 CI、Lint、格式化与版本号。
- 新成员只需克隆一个仓库。

负面 / 限制：

- 仓库体积随应用增长；
- CI 需要按路径过滤，避免每次全量构建；
- workspace 依赖关系变复杂时需要引入任务编排工具。

## 备选方案

| 方案 | 未采用原因 |
| --- | --- |
| 前后端分仓 | 早期契约变更频繁，跨仓同步成本高 |
| 单包全栈（一个 package.json） | 前后端依赖与运行环境差异大，边界模糊 |
| Nx / Turborepo | 当前规模不需要，增加学习与维护成本 |
| pnpm workspaces | 可用，但 npm 内置即可满足需求，减少工具依赖 |

## 后续动作

- M1 建立根 `package.json`、workspaces 与统一脚本。
- 当 CI 时间明显增长时，引入路径过滤或任务缓存。
- 新增应用前先确认是否真正需要独立部署单元。
