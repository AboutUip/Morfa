ALTER TABLE users ADD COLUMN vcode_hash TEXT;
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'cancelled'));
ALTER TABLE users ADD COLUMN cancelled_at INTEGER;

CREATE TABLE IF NOT EXISTS vcode_setup_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vcode_setup_tokens_user
  ON vcode_setup_tokens(user_id);

CREATE TABLE IF NOT EXISTS sensitive_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL
    CHECK (purpose IN ('password_reset', 'export', 'cancel')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sensitive_tickets_user
  ON sensitive_tickets(user_id, purpose);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_login_account TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  crypto_json TEXT NOT NULL,
  format_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  invalidated_at INTEGER,
  consumed_at INTEGER,
  consumed_by_user_id TEXT REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exports_one_valid_per_user
  ON exports(user_id)
  WHERE invalidated_at IS NULL AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exports_account
  ON exports(original_login_account);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
