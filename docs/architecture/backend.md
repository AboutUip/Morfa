# 后端架构

> 状态：草案 · 最后更新：2026-11-25

## 职责

Node.js 服务负责鉴权、项目与设计文档的持久化、资源管理、Agent 编排以及对外 API。前端不直接接触数据库，所有写入都经过校验与权限检查。

## 技术选型

| 项 | 选择 | 状态 |
| --- | --- | --- |
| 运行时 | Node.js >= 22（LTS） | 建议 |
| 语言 | TypeScript（strict） | 已选定 |
| HTTP 框架 | Fastify | 建议，待实现确认 |
| 校验 | Zod（与共享 schema 复用） | 建议 |
| 数据库 | SQLite（WAL） | 已选定 |
| 数据访问 | Drizzle ORM + better-sqlite3 | 建议 |
| 日志 | Pino（结构化 JSON） | 建议 |
| 测试 | Vitest + Supertest / Fastify inject | 建议 |

选型在 M1 实现时确认并写入 ADR；数据库约定见 [数据库设计](database.md)。

## 目录约定

```text
apps/server/
├─ src/
│  ├─ api/                 # 路由、请求校验、响应序列化
│  ├─ services/            # 业务用例：项目、设计文档、用户
│  ├─ db/                  # 连接、schema、仓储、迁移执行器
│  ├─ agent/               # 编排器、模型适配、工具注册与运行记录
│  └─ lib/                 # 配置、日志、错误、鉴权等基础设施
├─ migrations/             # 顺序编号的 SQL 迁移
├─ data/                   # 本地 SQLite 文件（不提交）
└─ README.md
```

分层规则：

- `api` 只做 HTTP 适配，不写业务逻辑。
- `services` 编排用例，接收已校验的输入，返回领域结果。
- `db` 封装 SQL 与事务，不依赖 HTTP 类型。
- `agent` 通过服务接口读写设计文档，不直接拼 SQL。

## API 约定

- 前缀：`/api/v1`，破坏性变更通过版本升级。
- 格式：JSON；上传使用 `multipart/form-data`。
- 鉴权：Cookie Session 或 Bearer Token（待定），写操作统一校验权限。
- 错误响应：

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "项目不存在或无权访问",
    "details": {},
    "requestId": "req_..."
  }
}
```

- 每个响应携带 `requestId`，日志与错误追踪使用同一 ID。
- 列表接口使用游标分页；时间统一为 UTC 毫秒时间戳。
- Agent 流式输出使用 SSE（单向事件流），事件类型包含 `run.started`、`message.delta`、`tool.started`、`tool.finished`、`patch.proposed`、`run.finished`、`run.failed`。

## 模块划分（规划）

| 模块 | 主要能力 |
| --- | --- |
| auth | 注册 / 登录 / 会话、密码哈希、登出 |
| projects | 项目 CRUD、成员与可见性（后续） |
| designs | 设计文档读取、补丁提交、版本与快照 |
| assets | 图片上传、元数据、访问控制 |
| agent | 运行创建、编排、工具调用、事件流、历史 |
| share | 只读分享链接（后续） |
| health | 存活与就绪检查 |

## 配置

- 通过环境变量注入，本地使用 `.env`（不提交），提供 `.env.example`。
- 关键配置：`PORT`、`DATABASE_URL`、`SESSION_SECRET`、`MODEL_PROVIDER`、`MODEL_API_KEY`、`LOG_LEVEL`、`APP_ORIGIN`。
- 启动时校验配置（Zod），缺失或非法直接失败，避免带病运行。

## 安全

- 所有输入使用 schema 校验；SQL 只通过参数化查询或 ORM 执行。
- 登录、生成与上传接口限流；敏感操作记录审计日志。
- 上传文件校验 MIME、扩展名与大小，存储在非公开目录，通过受控接口读取。
- Agent 工具按最小权限执行，模型输出不得直接拼接为 SQL、shell 或文件路径。
- 将用户内容视为不可信输入，防护 Prompt 注入；密钥不进入模型上下文。
- 设置安全响应头（CSP、HSTS、X-Content-Type-Options 等）。

## 可观测性

- 结构化日志：请求、耗时、状态码、`requestId`；错误附带堆栈但过滤敏感字段。
- 指标：请求量、延迟分位、错误率、Agent 运行成功率与 token 消耗。
- Agent 运行记录持久化，支持按用户 / 项目检索与回放。

## 测试与质量

- 服务层单元测试覆盖权限、状态迁移与事务边界。
- API 集成测试使用临时 SQLite 数据库，每个用例隔离。
- Agent 编排通过可替换的模型适配器做确定性测试（录制 / 模拟响应）。

## 待确认问题

- HTTP 框架最终选型（Fastify / Express / Hono）。
- 会话方案：服务端 Session 表还是签名 Token。
- 长任务执行方式：进程内任务表、Worker Threads 或独立队列。
- 文件存储抽象与生产部署形态（单机磁盘 / 对象存储）。
- 模型提供方与流式协议的统一抽象。
