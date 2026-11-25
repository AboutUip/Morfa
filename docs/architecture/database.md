# 数据库设计

> 状态：M1 认证、VCode、导出与项目表已实现 · 最后更新：2026-11-26

## 为什么选择 SQLite

- **零运维**：单文件数据库，适合本地开发、自托管与早期产品。
- **事务可靠**：完整 ACID，配合 WAL 可支撑中小规模并发读写。
- **备份简单**：`VACUUM INTO` 或 SQLite Backup API 即可生成一致快照。
- **迁移成本可控**：数据访问集中服务端，未来需要横向扩展时可迁移到 PostgreSQL。

已知限制：

- 同一时刻只允许一个写入者，写事务应短小，避免长事务阻塞。
- 不适合多节点直接共享同一文件；扩展时需拆分服务或更换数据库。
- 网络文件系统（NFS 等）上运行不可靠，生产环境使用本地磁盘或块存储。

## 连接与运行约定

数据库文件默认位于 `apps/server/data/morfa.sqlite`，已在 `.gitignore` 中排除。连接建立时执行：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

- 开发、测试与生产使用独立数据库文件；测试使用临时文件或内存库。
- 写操作放入显式事务，保持短小；批量写入分批提交。
- 读取多行时使用游标分页，避免一次加载全表。
- 时间统一存储为 UTC 毫秒整数（`INTEGER`），展示时由前端按 locale 格式化。
- 主键使用文本 ID（ULID / UUIDv7），便于生成与跨端引用；不使用自增 ID 暴露业务数量。

## 迁移

- 迁移文件位于 `apps/server/migrations/`，按 `NNNN_short-name.sql` 顺序编号。
- 迁移只向前执行，不修改已发布的迁移文件；回滚通过新增迁移完成。
- 每次迁移在事务中执行，并记录到 `schema_migrations` 表。
- 部署前先备份数据库；迁移脚本需在接近生产的数据量上验证耗时。
- 迁移与代码同时提交，CI 中执行「空库迁移 + 冒烟查询」。

## 已实现表（认证、VCode、导出）

迁移文件：`apps/server/migrations/0001_auth.sql`、`apps/server/migrations/0002_vcode_account.sql`。

```text
users
  id            TEXT PK                 -- UUID
  nickname      TEXT NOT NULL
  login_account TEXT NOT NULL COLLATE NOCASE UNIQUE
  password_hash TEXT NOT NULL           -- scrypt$salt$hash；注销后清空
  vcode_hash    TEXT                    -- scrypt$salt$hash；旧用户迁移后为 NULL
  avatar_path   TEXT NOT NULL           -- uploads/avatars/<uuid>.<ext>
  status        TEXT NOT NULL           -- active / cancelled
  cancelled_at  INTEGER
  created_at    INTEGER NOT NULL
  updated_at    INTEGER NOT NULL

sessions
  token_hash    TEXT PK                 -- SHA-256(token)
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  expires_at    INTEGER NOT NULL
  created_at    INTEGER NOT NULL

vcode_setup_tokens
  token_hash    TEXT PK                 -- SHA-256(setup token)
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  expires_at    INTEGER NOT NULL
  created_at    INTEGER NOT NULL

sensitive_tickets
  token_hash    TEXT PK                 -- SHA-256(ticket)
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  purpose       TEXT NOT NULL           -- password_reset / export / cancel
  expires_at    INTEGER NOT NULL
  created_at    INTEGER NOT NULL
  consumed_at   INTEGER

exports
  id                      TEXT PK
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  original_login_account  TEXT NOT NULL
  file_name               TEXT NOT NULL
  file_size               INTEGER NOT NULL
  sha256                  TEXT NOT NULL
  crypto_json             TEXT NOT NULL -- 包裹后的数据密钥与 GCM 参数
  format_version          INTEGER NOT NULL
  created_at              INTEGER NOT NULL
  invalidated_at          INTEGER       -- 被新导出覆盖
  consumed_at             INTEGER       -- 导入成功后吊销
  consumed_by_user_id     TEXT REFERENCES users(id)

projects
  id            TEXT PK
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  name          TEXT NOT NULL
  data          TEXT NOT NULL DEFAULT '{}'
  created_at    INTEGER NOT NULL
  updated_at    INTEGER NOT NULL
```

约定：

- 登录账号写入前统一转小写，唯一约束大小写不敏感。
- 密码与 VCode 均使用 scrypt + 随机盐哈希；注销后清空密码与 VCode。
- 头像与新导出文件存放在 `data/uploads/avatars/` 与 `data/exports/`，数据库只保存相对路径或文件名。
- 同一用户只能有一个有效导出包：`exports(user_id)` 在 `invalidated_at IS NULL AND consumed_at IS NULL` 上建立部分唯一索引。
- 新导出会将旧导出标记为 `invalidated_at` 并删除旧文件；导入成功后将导出标记为 `consumed_at` 并删除文件，保留元数据用于审计。
- 会话保留 30 天，过期后在启动或查询时清理；setup token 10 分钟、敏感操作 ticket 5 分钟。
- 索引：`sessions(user_id)`、`sessions(expires_at)`、`vcode_setup_tokens(user_id)`、`sensitive_tickets(user_id, purpose)`、`exports(original_login_account)`、`projects(user_id)`。

## 规划表（草案）

> 以下为项目、设计文档与 Agent 的规划草案，字段会随用例调整。

### 项目与设计文档

当前 `projects` 表只保存导出 / 导入所需的最小字段（`id`、`user_id`、`name`、`data`、时间戳），项目创建 UI 落地后再补充描述、封面与排序字段。

后续设计文档表草案：

```text
designs
  id            TEXT PK
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  name          TEXT NOT NULL
  document      TEXT NOT NULL          -- JSON 设计文档（带 schemaVersion）
  version       INTEGER NOT NULL DEFAULT 1
  created_at    INTEGER NOT NULL
  updated_at    INTEGER NOT NULL

design_versions
  id            TEXT PK
  design_id     TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE
  version       INTEGER NOT NULL
  document      TEXT NOT NULL          -- 快照，用于回滚与审计
  created_by    TEXT                   -- user_id 或 'agent'
  created_at    INTEGER NOT NULL
  UNIQUE (design_id, version)
```

设计文档以 JSON 存储，读取时校验 schema。是否使用 SQLite JSON1 函数做局部查询，视需求决定；高频查询的字段（名称、更新时间）提升为独立列。

### 资源

```text
assets
  id            TEXT PK
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  filename      TEXT NOT NULL
  mime_type     TEXT NOT NULL
  size_bytes    INTEGER NOT NULL
  storage_key   TEXT NOT NULL          -- 本地相对路径或对象存储 key
  created_at    INTEGER NOT NULL
```

### Agent 运行

```text
agent_threads
  id            TEXT PK
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  design_id     TEXT REFERENCES designs(id) ON DELETE SET NULL
  title         TEXT
  created_at    INTEGER NOT NULL
  updated_at    INTEGER NOT NULL

agent_messages
  id            TEXT PK
  thread_id     TEXT NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE
  role          TEXT NOT NULL          -- user / assistant / tool / system
  content       TEXT NOT NULL
  created_at    INTEGER NOT NULL

agent_runs
  id            TEXT PK
  thread_id     TEXT NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE
  status        TEXT NOT NULL          -- queued / running / succeeded / failed / cancelled
  model         TEXT
  prompt_tokens INTEGER
  completion_tokens INTEGER
  error_code    TEXT
  started_at    INTEGER
  finished_at   INTEGER

agent_steps
  id            TEXT PK
  run_id        TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE
  step_index    INTEGER NOT NULL
  type          TEXT NOT NULL          -- message / tool_call / patch
  payload       TEXT NOT NULL          -- JSON
  created_at    INTEGER NOT NULL
  UNIQUE (run_id, step_index)
```

Agent 记录用于审计、回放与成本统计，应设置保留策略；删除项目时级联清理。

## 索引建议

- `projects(owner_id, updated_at DESC)`
- `designs(project_id, updated_at DESC)`
- `design_versions(design_id, version DESC)`
- `sessions(token_hash)`、`sessions(expires_at)`
- `agent_threads(project_id, updated_at DESC)`
- `agent_runs(thread_id, started_at DESC)`
- `agent_steps(run_id, step_index)`
- `assets(project_id, created_at DESC)`

索引随查询模式添加，避免为「可能用到」提前建索引。

## 数据生命周期

- 用户删除项目时级联删除设计、资源与 Agent 记录；文件存储同步清理。
- 过期会话定期清理（启动时或定时任务）。
- 设计版本可设置保留上限（如最近 100 个 + 手动标记版本）。
- 备份文件与生产数据库分离存放，并验证可恢复性。

## 开放问题

- 设计文档 schema 版本迁移在读取时转换还是在后台批量迁移。
- 是否需要 FTS5 支持项目 / 设计全文搜索。
- 版本快照的存储策略（每次提交 vs 定时 / 手动）。
- 未来迁移 PostgreSQL 的触发条件与步骤。
