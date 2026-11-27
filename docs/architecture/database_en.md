# Database Design

> 中文原文：[database.md](database.md)
>
> Status: M1 authentication, VCode, export, projects, model providers, preferences, and API key tables implemented · Last updated: 2026-11-26

## Why SQLite

- **Zero operations**: a single-file database, suitable for local development, self-hosted deployments, and early-stage products.
- **Reliable transactions**: full ACID, and with WAL it can support small-to-medium concurrent reads and writes.
- **Simple backups**: `VACUUM INTO` or the SQLite Backup API produces a consistent snapshot.
- **Manageable migration cost**: data access is centralized on the server, so a future move to PostgreSQL is possible when horizontal scaling is needed.

Known limitations:

- Only one writer is allowed at a time; write transactions should be short to avoid blocking on long transactions.
- Not suitable for multiple nodes sharing the same file directly; scaling requires splitting services or changing databases.
- Unreliable on network file systems (NFS and similar); use local disk or block storage in production.

## Connection and runtime conventions

The database file defaults to `apps/server/data/morfa.sqlite` and is excluded in `.gitignore`. On connection, run:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

- Development, test, and production use separate database files; tests use a temporary file or an in-memory database.
- Write operations go into explicit transactions and stay short; batch writes commit in batches.
- Reading multiple rows uses cursor pagination to avoid loading the entire table at once.
- Time is stored uniformly as UTC millisecond integers (`INTEGER`); the frontend formats it by locale for display.
- Primary keys use text IDs (ULID / UUIDv7) for easy generation and cross-client references; auto-increment IDs are not used because they expose business volume.

## Migrations

- Migration files live in `apps/server/migrations/` and are numbered in order as `NNNN_short-name.sql`.
- Migrations only run forward; released migration files are never modified. Rollbacks are performed by adding a new migration.
- Each migration runs in a transaction and is recorded in the `schema_migrations` table.
- Back up the database before deployment; migration scripts must be validated for duration against near-production data volumes.
- Migrations are committed together with code; CI runs "empty-database migration + smoke queries".

## Implemented tables (authentication, VCode, export, projects, model providers, preferences, and API keys)

Migration files: `apps/server/migrations/0001_auth.sql`, `apps/server/migrations/0002_vcode_account.sql`, `apps/server/migrations/0003_model_providers.sql`, `apps/server/migrations/0004_model_capabilities.sql`, `apps/server/migrations/0005_mcp_api_keys.sql`.

```text
users
  id            TEXT PK                 -- UUID
  nickname      TEXT NOT NULL
  login_account TEXT NOT NULL COLLATE NOCASE UNIQUE
  password_hash TEXT NOT NULL           -- scrypt$salt$hash; cleared after cancellation
  vcode_hash    TEXT                    -- scrypt$salt$hash; NULL for migrated legacy users
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
  purpose       TEXT NOT NULL           -- password_reset / export / cancel / reveal_api_key
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
  crypto_json             TEXT NOT NULL -- wrapped data key and GCM parameters
  format_version          INTEGER NOT NULL
  created_at              INTEGER NOT NULL
  invalidated_at          INTEGER       -- replaced by a newer export
  consumed_at             INTEGER       -- revoked after a successful import
  consumed_by_user_id     TEXT REFERENCES users(id)

projects
  id            TEXT PK
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  name          TEXT NOT NULL
  data          TEXT NOT NULL DEFAULT '{}'
  created_at    INTEGER NOT NULL
  updated_at    INTEGER NOT NULL

model_providers
  id              TEXT PK
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  name            TEXT NOT NULL
  protocol        TEXT NOT NULL      -- openai / anthropic
  base_url        TEXT NOT NULL
  api_key_cipher  TEXT NOT NULL      -- API key encrypted with AES-256-GCM
  created_at      INTEGER NOT NULL
  updated_at      INTEGER NOT NULL
  last_synced_at  INTEGER

model_provider_models
  provider_id          TEXT NOT NULL REFERENCES model_providers(id) ON DELETE CASCADE
  model_id             TEXT NOT NULL
  display_name         TEXT
  created_at           INTEGER
  supports_streaming   INTEGER NOT NULL DEFAULT 1
  supports_thinking    INTEGER NOT NULL DEFAULT 0
  supports_multimodal  INTEGER NOT NULL DEFAULT 0
  PRIMARY KEY (provider_id, model_id)

user_preferences
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
  locale      TEXT CHECK (locale IN ('zh-CN', 'en-US'))
  theme_mode  TEXT CHECK (theme_mode IN ('system', 'light', 'dark'))
  updated_at  INTEGER NOT NULL

api_keys
  id              TEXT PRIMARY KEY
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
  name            TEXT NOT NULL
  token_hash      TEXT NOT NULL UNIQUE       -- SHA-256(API Key)
  token_prefix    TEXT NOT NULL              -- display only in lists
  allow_vcode     INTEGER NOT NULL DEFAULT 0
  allow_password  INTEGER NOT NULL DEFAULT 0
  last_used_at    INTEGER
  created_at      INTEGER NOT NULL
  updated_at      INTEGER NOT NULL
```

Conventions:

- Login accounts are lowercased before writing, and the uniqueness constraint is case-insensitive.
- Passwords and VCode both use scrypt with a random salt; passwords and VCode are cleared after account cancellation.
- Avatars and new export files are stored under `data/uploads/avatars/` and `data/exports/`; the database stores only relative paths or file names.
- A user can have only one valid export archive: a partial unique index on `exports(user_id)` where `invalidated_at IS NULL AND consumed_at IS NULL`.
- A new export marks the previous export with `invalidated_at` and deletes the old file; after a successful import the export is marked with `consumed_at` and the file is deleted, while the metadata is retained for auditing.
- Sessions last 30 days and are cleaned up at startup or on query after expiry; setup tokens last 10 minutes and sensitive-operation tickets 5 minutes.
- Model provider API keys are stored only as AES-256-GCM ciphertext; the server decrypts and returns the key only after the `reveal_api_key` ticket is consumed.
- Model lists are stored separately from providers; deleting a provider cascades to its models; resynchronization replaces the model list within a transaction.
- Model capabilities are stored with each model as three booleans; capabilities that can be detected automatically are written during fetch, while those that cannot be reliably detected use minimal defaults (streaming on, thinking and multimodal off), and manual user changes are preserved during synchronization.
- Account-level language and theme preferences are stored in `user_preferences`; fields may be `NULL`, meaning server preferences have not been synchronized yet and the frontend continues to use local settings.
- MCP API keys store only the SHA-256 hash and a display prefix; the plaintext is returned only once in the creation response; `allow_vcode` / `allow_password` control sensitive capability calls, and cancelling an account deletes all API keys.
- Indexes: `sessions(user_id)`, `sessions(expires_at)`, `vcode_setup_tokens(user_id)`, `sensitive_tickets(user_id, purpose)`, `exports(original_login_account)`, `projects(user_id)`, `model_providers(user_id, created_at)`, `model_provider_models(provider_id)`, `api_keys(user_id, created_at)`, `api_keys(token_hash)`.

## Planned tables (draft)

> The following is a draft for projects, design documents, and agents; fields will change as use cases evolve.

### Projects and design documents

The current `projects` table stores only the minimal fields required for export / import (`id`, `user_id`, `name`, `data`, timestamps). Description, cover, and ordering fields will be added once the project creation UI lands.

Draft design document tables:

```text
designs
  id            TEXT PK
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  name          TEXT NOT NULL
  document      TEXT NOT NULL          -- JSON design document (with schemaVersion)
  version       INTEGER NOT NULL DEFAULT 1
  created_at    INTEGER NOT NULL
  updated_at    INTEGER NOT NULL

design_versions
  id            TEXT PK
  design_id     TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE
  version       INTEGER NOT NULL
  document      TEXT NOT NULL          -- snapshot for rollback and audit
  created_by    TEXT                   -- user_id or 'agent'
  created_at    INTEGER NOT NULL
  UNIQUE (design_id, version)
```

Design documents are stored as JSON and validated against the schema on read. Whether to use SQLite JSON1 functions for partial queries will be decided based on requirements; frequently queried fields (name, update time) are promoted to dedicated columns.

### Assets

```text
assets
  id            TEXT PK
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
  filename      TEXT NOT NULL
  mime_type     TEXT NOT NULL
  size_bytes    INTEGER NOT NULL
  storage_key   TEXT NOT NULL          -- local relative path or object storage key
  created_at    INTEGER NOT NULL
```

### Agent runs

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

Agent records are used for auditing, replay, and cost accounting and should have a retention policy; deleting a project cascades the cleanup.

## Index recommendations

- `projects(user_id, updated_at DESC)`
- `designs(project_id, updated_at DESC)`
- `design_versions(design_id, version DESC)`
- `sessions(token_hash)`, `sessions(expires_at)`
- `agent_threads(project_id, updated_at DESC)`
- `agent_runs(thread_id, started_at DESC)`
- `agent_steps(run_id, step_index)`
- `assets(project_id, created_at DESC)`

Add indexes as query patterns emerge; avoid creating indexes in advance for cases that "might be used".

## Data lifecycle

- Deleting a project cascades to designs, assets, and Agent records; file storage is cleaned up in sync.
- Expired sessions are cleaned up periodically (at startup or by a scheduled job).
- Design versions can have a retention cap (for example, the latest 100 plus manually marked versions).
- Backups are stored separately from the production database, and restorability is verified.

## Open questions

- Whether design document schema version migrations convert on read or run as a background batch migration.
- Whether FTS5 is needed for full-text search across projects / designs.
- Storage strategy for version snapshots (on every commit vs scheduled / manual).
- Trigger conditions and steps for a future PostgreSQL migration.
