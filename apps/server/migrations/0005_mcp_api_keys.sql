CREATE TABLE IF NOT EXISTS user_preferences (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  locale      TEXT CHECK (locale IN ('zh-CN', 'en-US')),
  theme_mode  TEXT CHECK (theme_mode IN ('system', 'light', 'dark')),
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  token_hash      TEXT NOT NULL UNIQUE,
  token_prefix    TEXT NOT NULL,
  allow_vcode     INTEGER NOT NULL DEFAULT 0
    CHECK (allow_vcode IN (0, 1)),
  allow_password  INTEGER NOT NULL DEFAULT 0
    CHECK (allow_password IN (0, 1)),
  last_used_at    INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user
  ON api_keys(user_id, created_at);
