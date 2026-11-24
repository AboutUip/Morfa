# apps/server

Morfa 的 Node.js 后端：HTTP API、设计文档持久化、SQLite 数据访问与 Agent 编排。

> 状态：目录已预留，应用尚未搭建（M0）。

## 计划技术栈

- Node.js >= 22 + TypeScript（strict）
- Fastify（建议，待确认）
- Zod（请求与共享 schema 校验）
- SQLite + Drizzle ORM + better-sqlite3（建议）
- Pino（结构化日志）
- Vitest（单元与集成测试）

## 目录

```text
src/
├─ api/         HTTP 路由、校验与序列化
├─ services/    业务用例（项目、设计、用户）
├─ db/          连接、schema、仓储与迁移执行
├─ agent/       编排器、模型适配、工具与运行记录
└─ lib/         配置、日志、错误与鉴权
migrations/     顺序编号的 SQL 迁移
data/           本地 SQLite 文件（不提交）
```

## 约定

- API 前缀 `/api/v1`，错误统一为 `{ error: { code, message, details, requestId } }`。
- `api` 层只做 HTTP 适配；业务逻辑放在 `services`；SQL 只出现在 `db`。
- 所有输入使用 schema 校验，SQL 参数化，禁止字符串拼接。
- 时间以 UTC 毫秒整数存储。
- Agent 写操作生成补丁，不直接落库，详见 [Agent 设计](../../docs/agent/overview.md)。

## 数据与迁移

- 默认数据库：`data/morfa.sqlite`，启用 WAL、外键与 `busy_timeout`。
- 迁移文件只增不改，按 `NNNN_short-name.sql` 编号。
- 详见 [数据库设计](../../docs/architecture/database.md)。

## 后续工作

1. 初始化 TypeScript 服务与开发脚本。
2. 接入配置校验、日志、统一错误处理与健康检查。
3. 建立 SQLite 连接、迁移执行器与初始 schema。
4. 实现项目 / 设计文档 API。
5. 接入 Agent 编排与 SSE 事件流。
