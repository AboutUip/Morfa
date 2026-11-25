# apps/server

Morfa 的 Node.js 后端：HTTP API、账号认证、SQLite 数据访问与头像文件存储。

> 状态：M1 认证 API 已实现，编辑器与项目接口待接入。

## 技术栈

- Node.js >= 22 + TypeScript
- Fastify 5
- `node:sqlite`（WAL 模式）
- `@fastify/multipart`（头像上传）
- 密码：`crypto.scrypt` + 随机盐
- 会话：HttpOnly Cookie + 数据库哈希存储

## 目录

```text
src/
├─ api/         认证与头像路由
├─ services/    认证、密码、会话与头像业务
├─ db/          连接、迁移与用户 / 会话仓储
├─ lib/         Cookie 与错误处理
└─ index.ts     Fastify 启动入口
migrations/     顺序编号的 SQL 迁移
data/           本地 SQLite 与上传文件（不提交）
```

## 已实现 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/auth/me` | 当前会话用户，未登录返回 `{ user: null }` |
| `POST` | `/api/auth/login` | JSON 登录，成功后写入会话 Cookie |
| `POST` | `/api/auth/register` | `multipart/form-data` 注册；字段 `avatar`、`nickname`、`loginAccount`、`password`、`confirmPassword` |
| `POST` | `/api/auth/logout` | 删除当前会话并清除 Cookie |
| `GET` | `/uploads/avatars/:filename` | 读取头像文件 |

注册成功会直接创建会话，返回 `201` 与 `{ user }`，前端无需再次登录。

## 数据约定

- 登录账号写入数据库前统一转小写，`login_account` 使用 `COLLATE NOCASE UNIQUE`，平台内去重。
- 密码只保存 `scrypt` 哈希，不保存明文。
- 头像文件写入 `data/uploads/avatars/`，数据库 `avatar_path` 只保存形如 `uploads/avatars/<uuid>.png` 的相对路径。
- 头像限制 PNG / JPG / WebP，最大 2 MB，并校验文件签名。
- 会话 Cookie 名为 `morfa_session`，`HttpOnly; SameSite=Lax`，生产环境自动附加 `Secure`。
- 服务启动时自动执行 `migrations/*.sql`，迁移记录写入 `schema_migrations`。

## 命令

```bash
# 在仓库根目录
npm run dev:server                 # 仅启动 API
npm run dev                        # 同时启动 Web 与 API
npm run typecheck --workspace @morfa/server
```

默认监听 `127.0.0.1:3001`。可通过 `PORT`、`HOST`、`DATA_DIR`、`DATABASE_PATH` 环境变量覆盖。

## 后续工作

1. 增加登录失败限流与安全审计日志。
2. 项目与设计文档 API。
3. 头像更换、账户设置。
4. 正式部署的静态资源与上传存储方案。
