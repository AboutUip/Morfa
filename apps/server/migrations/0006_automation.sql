CREATE TABLE IF NOT EXISTS automation_custom_signals (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal_key  TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  deleted_at  INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (user_id, signal_key)
);

CREATE INDEX IF NOT EXISTS idx_automation_custom_signals_user
  ON automation_custom_signals(user_id, deleted_at, created_at);

CREATE TABLE IF NOT EXISTS automation_triggers (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  signal_key      TEXT NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  condition_json  TEXT NOT NULL DEFAULT '{"all":[]}',
  actions_json    TEXT NOT NULL DEFAULT '[]',
  cooldown_ms     INTEGER NOT NULL DEFAULT 0,
  scope           TEXT NOT NULL DEFAULT 'user',
  last_run_at     INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_automation_triggers_user
  ON automation_triggers(user_id, deleted_at, signal_key);

CREATE TABLE IF NOT EXISTS automation_events (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal_key      TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  source          TEXT NOT NULL,
  source_run_id   TEXT,
  correlation_id  TEXT,
  depth           INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_events_user
  ON automation_events(user_id, signal_key, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_events_idempotency
  ON automation_events(user_id, signal_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS automation_runs (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_id          TEXT NOT NULL,
  trigger_name        TEXT NOT NULL,
  event_id            TEXT NOT NULL,
  signal_key          TEXT NOT NULL,
  status              TEXT NOT NULL,
  payload_json        TEXT NOT NULL,
  error_code          TEXT,
  error_message       TEXT,
  depth               INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  started_at          INTEGER,
  finished_at         INTEGER,
  cancel_requested_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_user
  ON automation_runs(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_automation_runs_status
  ON automation_runs(status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_once
  ON automation_runs(trigger_id, event_id);

CREATE TABLE IF NOT EXISTS automation_run_steps (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  step_index    INTEGER NOT NULL,
  action_type   TEXT NOT NULL,
  status        TEXT NOT NULL,
  input_json    TEXT NOT NULL,
  output_json   TEXT,
  error_code    TEXT,
  error_message TEXT,
  started_at    INTEGER,
  finished_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_automation_run_steps_run
  ON automation_run_steps(run_id, step_index);
