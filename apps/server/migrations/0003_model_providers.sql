DROP INDEX IF EXISTS idx_sensitive_tickets_user;

ALTER TABLE sensitive_tickets RENAME TO sensitive_tickets_legacy;

CREATE TABLE sensitive_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL
    CHECK (purpose IN (
      'password_reset',
      'export',
      'cancel',
      'reveal_api_key'
    )),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);

INSERT INTO sensitive_tickets
  (token_hash, user_id, purpose, expires_at, created_at, consumed_at)
SELECT token_hash, user_id, purpose, expires_at, created_at, consumed_at
FROM sensitive_tickets_legacy;

DROP TABLE sensitive_tickets_legacy;

CREATE INDEX idx_sensitive_tickets_user
  ON sensitive_tickets(user_id, purpose);

CREATE TABLE model_providers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('openai', 'anthropic')),
  base_url TEXT NOT NULL,
  api_key_cipher TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_synced_at INTEGER
);

CREATE INDEX idx_model_providers_user
  ON model_providers(user_id, created_at);

CREATE TABLE model_provider_models (
  provider_id TEXT NOT NULL
    REFERENCES model_providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER,
  PRIMARY KEY (provider_id, model_id)
);

CREATE INDEX idx_model_provider_models_provider
  ON model_provider_models(provider_id);
