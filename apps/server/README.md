# apps/server

Morfa 的 Node.js 后端：HTTP API、账号认证、VCode 验证、SQLite 数据访问、加密数据导出与头像文件存储。

> 状态：M1 认证、VCode、账号、导出、模型供应商、模型可用性测试、API Key、原生 MCP API 与 WebSocket 实时通道已实现；编辑器与项目接口待接入。

## 技术栈

- Node.js >= 22 + TypeScript
- Fastify 5
- `@fastify/websocket`（实时信封、订阅与推送）
- `node:sqlite`（WAL 模式）
- `@fastify/multipart`（头像与数据包上传）
- 密码 / VCode：`crypto.scrypt` + 随机盐
- 会话：HttpOnly Cookie + 数据库哈希存储
- 导出：AES-256-GCM + gzip，数据密钥由服务器主密钥包裹

## 目录

```text
src/
├─ api/         认证、账号、导出与头像路由
├─ mcp/         MCP 总控、能力注册、鉴权、参数校验与 llms.txt
├─ realtime/    WebSocket 网关、操作注册、订阅、心跳与领域事件
├─ services/    认证、VCode、个人资料、偏好、API Key、数据导出 / 导入、模型供应商与模型测试
├─ db/          连接、迁移、用户 / 会话 / 票据 / 导出 / 项目仓储
├─ lib/         Cookie、错误处理、密钥派生与加密辅助
└─ index.ts     Fastify 启动入口
migrations/     顺序编号的 SQL 迁移
data/           本地 SQLite、头像、导出文件与主密钥（不提交）
```

## 已实现 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/auth/me` | 当前会话用户，未登录返回 `{ user: null }` |
| `POST` | `/api/auth/login` | JSON 登录；缺少 VCode 时返回 setup token，不创建会话 |
| `POST` | `/api/auth/vcode-setup` | 设置 VCode 并创建会话 |
| `POST` | `/api/auth/register` | `multipart/form-data` 注册；支持可选数据包导入 |
| `POST` | `/api/auth/logout` | 删除当前会话并清除 Cookie |
| `PATCH` | `/api/me/profile` | 修改昵称 |
| `POST` | `/api/me/avatar` | 更换头像 |
| `POST` | `/api/me/password/verify` | 只校验当前密码，不修改 |
| `POST` | `/api/me/password` | 校验当前密码后修改密码，新密码只提交一次 |
| `POST` | `/api/me/vcode/verify` | 校验 VCode，返回 5 分钟敏感操作 ticket |
| `POST` | `/api/me/password/forgot` | 消费 ticket 后直接重置密码，新密码只提交一次 |
| `GET` | `/api/me/export` | 当前有效导出包状态 |
| `POST` | `/api/me/export` | 消费 ticket，生成加密导出包 |
| `GET` | `/api/me/export/download` | 下载当前有效导出包 |
| `POST` | `/api/me/cancel` | 校验密码 + ticket 后注销账号 |
| `GET` | `/api/me/model-providers` | 读取模型供应商与已拉取模型 |
| `POST` | `/api/me/model-providers` | 创建 OpenAI / Anthropic 供应商并拉取模型 |
| `POST` | `/api/me/model-providers/:id/sync` | 重新拉取供应商模型 |
| `PATCH` | `/api/me/model-providers/:id/models` | 更新单个模型的流式 / 思考 / 多模态能力 |
| `POST` | `/api/me/model-providers/:id/test` | 真实调用模型，以 NDJSON 流返回测试过程与结果 |
| `DELETE` | `/api/me/model-providers/:id` | 删除供应商 |
| `POST` | `/api/me/model-providers/:id/reveal-key` | 消费 VCode ticket 后查看 API Key |
| `GET` | `/api/me/preferences` | 读取账号级语言 / 主题偏好 |
| `PATCH` | `/api/me/preferences` | 更新账号级语言 / 主题偏好 |
| `GET` | `/api/me/api-keys` | 列出当前账号的 API Key（不含明文） |
| `POST` | `/api/me/api-keys` | 创建 API Key，并设置 VCode / 密码权限 |
| `PATCH` | `/api/me/api-keys/:id` | 更新 API Key 名称或权限 |
| `DELETE` | `/api/me/api-keys/:id` | 删除 API Key |
| `GET` | `/api/me/mcp/capabilities` | 读取完整 MCP 能力目录 |
| `GET` | `/api/me/mcp/capabilities/:name` | 读取 MCP 能力详情 |
| `POST` | `/mcp` | MCP JSON-RPC 2.0 端点，使用 API Key 认证 |
| `GET` | `/api/mcp/capabilities` | 使用 API Key 查询可用 MCP 能力 |
| `GET` | `/api/mcp/capabilities/:name` | 使用 API Key 查询能力详情 |
| `POST` | `/api/mcp/capabilities/:name/call` | 使用 API Key 直接调用能力 |
| `GET` | `/api/mcp/export/latest` | 使用 API Key 下载当前有效导出包 |
| `GET` | `/llms.txt` | 公开的 MCP llms.txt 文档 |
| `GET` | `/api/realtime` | WebSocket Upgrade；请求 / 订阅 / 推送统一信封 |
| `GET` | `/uploads/avatars/:filename` | 读取头像文件 |

注册成功会直接创建会话，返回 `201` 和 `{ user, importedProjectCount }`，前端无需再次登录。缺少 VCode 的老用户登录时返回 `requiresVCodeSetup`、`setupToken` 和 `preview`，完成设置后才创建会话。

## 数据约定

- 登录账号写入数据库前统一转小写，`login_account` 使用 `COLLATE NOCASE UNIQUE`，平台内去重。
- 密码与 VCode 只保存 `scrypt` 哈希，不保存明文；注销账号时清空。
- 头像文件写入 `data/uploads/avatars/`，数据库 `avatar_path` 只保存形如 `uploads/avatars/<uuid>.png` 的相对路径。
- 头像限制 PNG / JPG / WebP，最大 2 MB，并校验文件签名。
- 会话 Cookie 名为 `morfa_session`，`HttpOnly; SameSite=Lax`，生产环境自动附加 `Secure`。
- 服务启动时自动执行 `migrations/*.sql`，迁移记录写入 `schema_migrations`。
- setup token 10 分钟有效；VCode 敏感操作 ticket 5 分钟有效且只能消费一次。
- 模型供应商 API Key 使用服务器主密钥 AES-256-GCM 加密存储；列表接口不返回 Key，查看 Key 需要 `reveal_api_key` ticket。
- 模型列表由服务端请求供应商，限制 HTTP / HTTPS 与 15 秒超时；自托管部署应评估可访问的出站地址范围，避免 SSRF 风险。
- 每个模型保存 `supports_streaming`、`supports_thinking`、`supports_multimodal` 三项能力。拉取时能从供应商元数据稳定识别的能力直接采用；无法判断的默认「支持流式、不支持思考、不支持多模态」，用户可在模型编辑弹窗中调整，重新同步会保留手动配置。
- `POST /api/me/model-providers/:id/test` 使用存储的 API Key 发起真实请求，固定提示模型返回 `MORFA`；模型支持流式时使用流式协议。响应为 `application/x-ndjson`，事件类型包括 `start`、`reasoning`、`delta`、`done`、`error`；空返回、鉴权失败、超时与中断分别映射为稳定错误码。
- 模型测试会真实消耗供应商 token，单次最长 60 秒；测试响应不缓存，API Key 与模型正文不写入日志。
- 同一用户只保留一个有效导出包；新导出使旧包失效，导入成功后吊销数据包。
- API Key 只保存 SHA-256 哈希与展示前缀，明文只在创建响应中返回一次；每个 Key 可独立开启 VCode 与密码敏感操作权限，调用时分别传入 `vcode` / `password`。
- MCP 能力注册与执行统一由 `apps/server/src/mcp/McpController` 管理；`GET /llms.txt` 自动生成能力目录、参数 schema 与调用示例。详见 [MCP 集成](../../docs/integrations/mcp.md)。
- 账号级语言与主题偏好保存在 `user_preferences`；更新后发布 `preferences.changed`，通过 WebSocket 推送给该用户所有在线连接，不再轮询。
- 实时通道使用 `@fastify/websocket`，单条消息上限 256 KB；注销、改密、重置密码与注销账号会主动关闭用户连接。信封与扩展方式见 [实时网络通道](../../docs/architecture/realtime.md)。

## 导出安全

- 导出包内容先 gzip 压缩，再使用随机 256 位数据密钥做 AES-256-GCM 加密。
- 数据密钥使用服务器主密钥包裹，主密钥来自 `MORFA_EXPORT_MASTER_KEY`（Base64 或 64 位十六进制）或本地 `data/export-master.key`。
- 服务端保存导出记录、SHA-256、包裹后的密钥与 GCM 参数；数据库不保存明文数据密钥。
- 导入时校验原账号已注销、数据包未消费、文件哈希、格式版本与原用户 ID / 登录账号，再解密、解压并消费数据包。
- 主密钥丢失会导致历史导出包无法恢复；生产环境应将主密钥放入密钥管理服务并做好备份。

## 命令

```bash
# 在仓库根目录
npm run dev:server                 # 仅启动 API
npm run dev                        # 同时启动 Web 与 API
npm run typecheck --workspace @morfa/server
```

默认监听 `127.0.0.1:3001`。可通过 `PORT`、`HOST`、`DATA_DIR`、`DATABASE_PATH`、`MORFA_EXPORT_MASTER_KEY` 环境变量覆盖。

## 后续工作

1. 增加登录失败与敏感接口的审计日志。
2. 项目与设计文档 API。
3. 导出包有效期与后台清理策略。
4. 正式部署的静态资源、上传与密钥管理方案。
