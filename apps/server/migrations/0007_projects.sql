ALTER TABLE projects ADD COLUMN project_type TEXT NOT NULL DEFAULT 'software';
ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE projects ADD COLUMN icon_path TEXT;
ALTER TABLE projects ADD COLUMN share_code TEXT;
ALTER TABLE projects ADD COLUMN client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_share_code
  ON projects(share_code)
  WHERE share_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_client_request
  ON projects(user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user
  ON project_members(user_id, joined_at);
