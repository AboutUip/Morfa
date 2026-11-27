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
      'reveal_api_key',
      'delete_project'
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
