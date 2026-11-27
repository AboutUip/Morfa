CREATE TABLE IF NOT EXISTS project_assets (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  mime_type    TEXT NOT NULL,
  size         INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_assets_project_created
  ON project_assets(project_id, created_at DESC);
