CREATE TABLE IF NOT EXISTS account_components (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  target TEXT NOT NULL DEFAULT 'both',
  pages_json TEXT NOT NULL,
  root_control_id TEXT NOT NULL,
  state_count INTEGER NOT NULL DEFAULT 0,
  source_project_id TEXT,
  source_control_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_components_user_updated
  ON account_components (user_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_components_source
  ON account_components (user_id, source_project_id, source_control_id)
  WHERE source_project_id IS NOT NULL AND source_control_id IS NOT NULL;
