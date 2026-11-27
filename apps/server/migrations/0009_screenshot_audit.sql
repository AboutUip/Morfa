CREATE TABLE IF NOT EXISTS screenshot_audits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  api_key_id TEXT,
  project_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  page_id TEXT,
  scale REAL NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_code TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  artifact_token TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_screenshot_audits_user_created
  ON screenshot_audits (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_screenshot_audits_project_created
  ON screenshot_audits (project_id, created_at DESC);
