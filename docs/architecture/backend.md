# 后端架构

> 状态：M1 认证、VCode、账号、导出与模型供应商 API 已实现 · 最后更新：2026-11-26

## 职责

Node.js 服务负责鉴权、项目与设计文档的持久化、资源管理、Agent 编排以及对外 API。前端不直接接触数据库，所有写入都经过校验与权限检查。

## 技术选型

| 项 | 选择 | 状态 |
| --- | --- | --- |
| 运行时 | Node.js >= 22（LTS） | 已接入 |
| 语言 | TypeScript（strict） | 已接入 |
| HTTP 框架 | Fastify 5 | 已接入（认证 API） |
| 校验 | Zod（与共享 schema 复用） | 建议，当前为手写校验 |
| 数据库 | SQLite（WAL） | 已接入（认证） |
| 数据访问 | `node:sqlite`（原生） | 已接入；ORM 评估中 |
| Agent 流式协议 | XAIOP Node SDK | 已 vendored，详见 [XAIOP 集成](../integrations/xaiop.md) |
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

## 已实现：认证、账号与模型供应商 API

- `GET /api/health`：健康检查。
- `GET /api/auth/me`：读取当前会话用户；未登录返回 `{ user: null }`。会话用户缺少 VCode 或已注销时，服务端删除会话并清除 Cookie。
- `POST /api/auth/login`：JSON 登录，成功后写入 `morfa_session` Cookie。账号缺少 VCode 时返回 `requiresVCodeSetup` 与短期 setup token，不创建会话。
- `POST /api/auth/vcode-setup`：校验 setup token 与 6 位 VCode，写入 VCode 哈希并创建会话。
- `POST /api/auth/register`：`multipart/form-data`，字段为 `avatar`、`nickname`、`loginAccount`、`password`、`confirmPassword`、`vcode`，可选 `importOriginalAccount` 与 `archive`；成功后创建会话并自动登录。
- `POST /api/auth/logout`：删除会话并清除 Cookie。
- `PATCH /api/me/profile`：修改昵称。
- `POST /api/me/avatar`：上传新头像，成功写入后删除旧头像文件。
- `POST /api/me/password/verify`：只校验当前密码，供密码验证弹窗与串行注销流程使用。
- `POST /api/me/password`：校验当前密码后修改密码，新密码只提交一次；保留当前会话并吊销其他会话。
- `POST /api/me/vcode/verify`：校验 VCode，返回 5 分钟有效的敏感操作 ticket。
- `POST /api/me/password/forgot`：消费 `password_reset` ticket 后直接设置新密码，无需旧密码，新密码只提交一次。
- `GET /api/me/export`：读取当前有效导出包状态。
- `POST /api/me/export`：消费 `export` ticket，生成新的加密导出包并使旧包立即失效。
- `GET /api/me/export/download`：下载当前有效导出包。
- `POST /api/me/cancel`：校验当前密码并消费 `cancel` ticket，软删除账号、清除密码与 VCode、吊销全部会话。
- `GET /api/me/model-providers`：读取当前用户的模型供应商与已拉取模型。
- `POST /api/me/model-providers`：创建 OpenAI / Anthropic 供应商；服务端请求模型列表，成功后才保存供应商。
- `POST /api/me/model-providers/:id/sync`：使用存储的 API Key 重新拉取模型列表。
- `DELETE /api/me/model-providers/:id`：删除供应商并级联删除模型。
- `POST /api/me/model-providers/:id/reveal-key`：消费 `reveal_api_key` ticket 后返回解密后的 API Key。
- `GET /uploads/avatars/:filename`：读取头像。
- 登录账号写入前转小写，数据库使用 `COLLATE NOCASE UNIQUE` 去重。
- 密码与 VCode 均使用 `scrypt` + 随机盐哈希；会话令牌、setup token 与敏感操作 ticket 只保存 SHA-256 哈希。
- VCode 验证失败按用户限流（10 分钟 5 次），验证成功后 ticket 只能消费一次。
- 导出包使用随机数据密钥 AES-256-GCM 加密，数据密钥再由服务器主密钥包裹；主密钥来自 `MORFA_EXPORT_MASTER_KEY` 或本地 `data/export-master.key`。
- 模型供应商 API Key 使用同一服务器主密钥做 AES-256-GCM 加密后存储；列表接口不返回 Key，只有消费 `reveal_api_key` ticket 后才能解密查看。
- 模型列表由服务端请求供应商，限制为 HTTP / HTTPS、15 秒超时，并且不记录 API Key 或响应正文；自托管部署应结合出站网络策略评估 Base URL 的 SSRF 风险。
- 头像文件写入 `apps/server/data/uploads/avatars/`，数据库仅保存 `uploads/avatars/<uuid>.<ext>` 相对路径，限制 PNG / JPG / WebP 2 MB。
- 详细取舍见 [ADR 0005](../decisions/0005-auth-and-avatar.md)。

## API 约定

- 现有认证接口位于 `/api/auth/*`；版本化前缀 `/api/v1` 在项目 / 设计文档 API 落地时统一评估。
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
- Agent 流式输出使用 SSE（单向事件流），事件类型包含 `run.started`、`message.delta`、`tool.started`、`tool.finished`、`patch.proposed`、`run.finished`、`run.failed`。增量载荷规划使用 XAIOP 编码，前端通过 browser SDK 解析。

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
- 认证：密码 scrypt 哈希；会话令牌随机生成、数据库仅保存哈希；Cookie 为 `HttpOnly; SameSite=Lax`。
- 上传：头像限制 MIME、文件签名与 2 MB 大小；文件名由服务端生成，禁止路径穿越。
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
