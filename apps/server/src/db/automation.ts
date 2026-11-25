import { db } from "./connection.js";

export type AutomationRunStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "skipped"
  | "cancelled";

export interface CustomSignalRow {
  id: string;
  user_id: string;
  signal_key: string;
  name: string;
  description: string;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface TriggerRow {
  id: string;
  user_id: string;
  name: string;
  signal_key: string;
  enabled: number;
  condition_json: string;
  actions_json: string;
  cooldown_ms: number;
  scope: string;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface EventRow {
  id: string;
  user_id: string;
  signal_key: string;
  payload_json: string;
  source: string;
  source_run_id: string | null;
  correlation_id: string | null;
  depth: number;
  idempotency_key: string | null;
  created_at: number;
}

export interface RunRow {
  id: string;
  user_id: string;
  trigger_id: string;
  trigger_name: string;
  event_id: string;
  signal_key: string;
  status: AutomationRunStatus;
  payload_json: string;
  error_code: string | null;
  error_message: string | null;
  depth: number;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  cancel_requested_at: number | null;
}

export interface RunStepRow {
  id: string;
  run_id: string;
  step_index: number;
  action_type: string;
  status: AutomationRunStatus;
  input_json: string;
  output_json: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: number | null;
  finished_at: number | null;
}

export function listCustomSignals(userId: string): CustomSignalRow[] {
  return db
    .prepare(
      `SELECT * FROM automation_custom_signals
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC`,
    )
    .all(userId) as unknown as CustomSignalRow[];
}

export function countCustomSignals(userId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM automation_custom_signals
       WHERE user_id = ? AND deleted_at IS NULL`,
    )
    .get(userId) as { count: number };
  return row.count;
}

export function findCustomSignal(
  userId: string,
  signalKey: string,
): CustomSignalRow | undefined {
  return db
    .prepare(
      `SELECT * FROM automation_custom_signals
       WHERE user_id = ? AND signal_key = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .get(userId, signalKey) as unknown as CustomSignalRow | undefined;
}

export function insertCustomSignal(input: {
  id: string;
  userId: string;
  signalKey: string;
  name: string;
  description: string;
  now: number;
}) {
  db.prepare(
    `INSERT INTO automation_custom_signals
      (id, user_id, signal_key, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    input.signalKey,
    input.name,
    input.description,
    input.now,
    input.now,
  );
}

export function updateCustomSignal(input: {
  userId: string;
  signalKey: string;
  name: string;
  description: string;
  now: number;
}): boolean {
  const result = db
    .prepare(
      `UPDATE automation_custom_signals
       SET name = ?, description = ?, updated_at = ?
       WHERE user_id = ? AND signal_key = ? AND deleted_at IS NULL`,
    )
    .run(
      input.name,
      input.description,
      input.now,
      input.userId,
      input.signalKey,
    );
  return Number(result.changes) === 1;
}

export function softDeleteCustomSignal(
  userId: string,
  signalKey: string,
  now: number,
): boolean {
  const result = db
    .prepare(
      `UPDATE automation_custom_signals
       SET deleted_at = ?, updated_at = ?
       WHERE user_id = ? AND signal_key = ? AND deleted_at IS NULL`,
    )
    .run(now, now, userId, signalKey);
  return Number(result.changes) === 1;
}

export function disableTriggersForSignal(
  userId: string,
  signalKey: string,
  now: number,
) {
  db.prepare(
    `UPDATE automation_triggers
     SET enabled = 0, updated_at = ?
     WHERE user_id = ? AND signal_key = ? AND deleted_at IS NULL`,
  ).run(now, userId, signalKey);
}

export function cancelQueuedRunsForSignal(
  userId: string,
  signalKey: string,
  now: number,
) {
  db.prepare(
    `UPDATE automation_runs
     SET status = 'cancelled', finished_at = ?,
         error_code = 'AUTOMATION_SIGNAL_DELETED',
         error_message = '信号已删除'
     WHERE user_id = ? AND signal_key = ? AND status = 'queued'`,
  ).run(now, userId, signalKey);
}

export function listTriggersForUser(userId: string): TriggerRow[] {
  return db
    .prepare(
      `SELECT * FROM automation_triggers
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC`,
    )
    .all(userId) as unknown as TriggerRow[];
}

export function countTriggers(userId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM automation_triggers
       WHERE user_id = ? AND deleted_at IS NULL`,
    )
    .get(userId) as { count: number };
  return row.count;
}

export function findTriggerForUser(
  userId: string,
  id: string,
): TriggerRow | undefined {
  return db
    .prepare(
      `SELECT * FROM automation_triggers
       WHERE user_id = ? AND id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .get(userId, id) as unknown as TriggerRow | undefined;
}

export function listActiveTriggersForSignal(
  userId: string,
  signalKey: string,
): TriggerRow[] {
  return db
    .prepare(
      `SELECT * FROM automation_triggers
       WHERE user_id = ? AND signal_key = ?
         AND enabled = 1 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
    )
    .all(userId, signalKey) as unknown as TriggerRow[];
}

export function insertTrigger(input: {
  id: string;
  userId: string;
  name: string;
  signalKey: string;
  enabled: boolean;
  conditionJson: string;
  actionsJson: string;
  cooldownMs: number;
  now: number;
}) {
  db.prepare(
    `INSERT INTO automation_triggers
      (id, user_id, name, signal_key, enabled, condition_json,
       actions_json, cooldown_ms, scope, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)`,
  ).run(
    input.id,
    input.userId,
    input.name,
    input.signalKey,
    input.enabled ? 1 : 0,
    input.conditionJson,
    input.actionsJson,
    input.cooldownMs,
    input.now,
    input.now,
  );
}

export function updateTrigger(input: {
  userId: string;
  id: string;
  name: string;
  signalKey: string;
  enabled: boolean;
  conditionJson: string;
  actionsJson: string;
  cooldownMs: number;
  now: number;
}): boolean {
  const result = db
    .prepare(
      `UPDATE automation_triggers
       SET name = ?, signal_key = ?, enabled = ?, condition_json = ?,
           actions_json = ?, cooldown_ms = ?, updated_at = ?
       WHERE user_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .run(
      input.name,
      input.signalKey,
      input.enabled ? 1 : 0,
      input.conditionJson,
      input.actionsJson,
      input.cooldownMs,
      input.now,
      input.userId,
      input.id,
    );
  return Number(result.changes) === 1;
}

export function setTriggerEnabled(
  userId: string,
  id: string,
  enabled: boolean,
  now: number,
): boolean {
  const result = db
    .prepare(
      `UPDATE automation_triggers
       SET enabled = ?, updated_at = ?
       WHERE user_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .run(enabled ? 1 : 0, now, userId, id);
  return Number(result.changes) === 1;
}

export function touchTriggerRun(id: string, now: number) {
  db.prepare(
    "UPDATE automation_triggers SET last_run_at = ? WHERE id = ?",
  ).run(now, id);
}

export function softDeleteTrigger(
  userId: string,
  id: string,
  now: number,
): boolean {
  const result = db
    .prepare(
      `UPDATE automation_triggers
       SET enabled = 0, deleted_at = ?, updated_at = ?
       WHERE user_id = ? AND id = ? AND deleted_at IS NULL`,
    )
    .run(now, now, userId, id);
  return Number(result.changes) === 1;
}

export function cancelQueuedRunsForTrigger(
  userId: string,
  triggerId: string,
  now: number,
) {
  db.prepare(
    `UPDATE automation_runs
     SET status = 'cancelled', finished_at = ?,
         error_code = 'AUTOMATION_TRIGGER_DELETED',
         error_message = '触发器已删除'
     WHERE user_id = ? AND trigger_id = ? AND status = 'queued'`,
  ).run(now, userId, triggerId);
}

export function insertEvent(input: {
  id: string;
  userId: string;
  signalKey: string;
  payloadJson: string;
  source: string;
  sourceRunId: string | null;
  correlationId: string | null;
  depth: number;
  idempotencyKey: string | null;
  now: number;
}): boolean {
  try {
    db.prepare(
      `INSERT INTO automation_events
        (id, user_id, signal_key, payload_json, source, source_run_id,
         correlation_id, depth, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.userId,
      input.signalKey,
      input.payloadJson,
      input.source,
      input.sourceRunId,
      input.correlationId,
      input.depth,
      input.idempotencyKey,
      input.now,
    );
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed: automation_events/.test(error.message)
    ) {
      return false;
    }
    throw error;
  }
}

export function findEventById(id: string): EventRow | undefined {
  return db
    .prepare("SELECT * FROM automation_events WHERE id = ? LIMIT 1")
    .get(id) as unknown as EventRow | undefined;
}

export function insertRun(input: {
  id: string;
  userId: string;
  triggerId: string;
  triggerName: string;
  eventId: string;
  signalKey: string;
  status: AutomationRunStatus;
  payloadJson: string;
  errorCode: string | null;
  errorMessage: string | null;
  depth: number;
  now: number;
}): boolean {
  try {
    db.prepare(
      `INSERT INTO automation_runs
        (id, user_id, trigger_id, trigger_name, event_id, signal_key,
         status, payload_json, error_code, error_message, depth, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.userId,
      input.triggerId,
      input.triggerName,
      input.eventId,
      input.signalKey,
      input.status,
      input.payloadJson,
      input.errorCode,
      input.errorMessage,
      input.depth,
      input.now,
    );
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed: automation_runs/.test(error.message)
    ) {
      return false;
    }
    throw error;
  }
}

export function findRunForUser(
  userId: string,
  runId: string,
): RunRow | undefined {
  return db
    .prepare(
      "SELECT * FROM automation_runs WHERE user_id = ? AND id = ? LIMIT 1",
    )
    .get(userId, runId) as unknown as RunRow | undefined;
}

export function findLatestRunForTrigger(
  userId: string,
  triggerId: string,
): RunRow | undefined {
  return db
    .prepare(
      `SELECT * FROM automation_runs
       WHERE user_id = ? AND trigger_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(userId, triggerId) as unknown as RunRow | undefined;
}

export function listRunsForUser(
  userId: string,
  limit = 30,
): RunRow[] {
  return db
    .prepare(
      `SELECT * FROM automation_runs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(userId, limit) as unknown as RunRow[];
}

export function listQueuedRuns(limit = 10): RunRow[] {
  return db
    .prepare(
      `SELECT * FROM automation_runs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .all(limit) as unknown as RunRow[];
}

export function claimRun(runId: string, now: number): boolean {
  const result = db
    .prepare(
      `UPDATE automation_runs
       SET status = 'running', started_at = ?
       WHERE id = ? AND status = 'queued'`,
    )
    .run(now, runId);
  return Number(result.changes) === 1;
}

export function finishRun(input: {
  runId: string;
  status: AutomationRunStatus;
  errorCode: string | null;
  errorMessage: string | null;
  now: number;
}) {
  db.prepare(
    `UPDATE automation_runs
     SET status = ?, error_code = ?, error_message = ?, finished_at = ?
     WHERE id = ? AND status IN ('running', 'queued')`,
  ).run(
    input.status,
    input.errorCode,
    input.errorMessage,
    input.now,
    input.runId,
  );
}

export function requestCancelRun(
  userId: string,
  runId: string,
  now: number,
): RunRow | undefined {
  const run = findRunForUser(userId, runId);
  if (!run) return undefined;

  if (run.status === "queued") {
    db.prepare(
      `UPDATE automation_runs
       SET status = 'cancelled', cancel_requested_at = ?, finished_at = ?,
           error_code = 'AUTOMATION_CANCELLED',
           error_message = '运行已取消'
       WHERE id = ?`,
    ).run(now, now, runId);
  } else if (run.status === "running") {
    db.prepare(
      "UPDATE automation_runs SET cancel_requested_at = ? WHERE id = ?",
    ).run(now, runId);
  }

  return findRunForUser(userId, runId);
}

export function isRunCancelRequested(runId: string): boolean {
  const row = db
    .prepare(
      "SELECT cancel_requested_at FROM automation_runs WHERE id = ?",
    )
    .get(runId) as { cancel_requested_at: number | null } | undefined;
  return Boolean(row?.cancel_requested_at);
}

export function insertRunStep(input: {
  id: string;
  runId: string;
  stepIndex: number;
  actionType: string;
  inputJson: string;
  now: number;
}) {
  db.prepare(
    `INSERT INTO automation_run_steps
      (id, run_id, step_index, action_type, status, input_json, started_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?)`,
  ).run(
    input.id,
    input.runId,
    input.stepIndex,
    input.actionType,
    input.inputJson,
    input.now,
  );
}

export function finishRunStep(input: {
  id: string;
  status: AutomationRunStatus;
  outputJson: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  now: number;
}) {
  db.prepare(
    `UPDATE automation_run_steps
     SET status = ?, output_json = ?, error_code = ?, error_message = ?,
         finished_at = ?
     WHERE id = ?`,
  ).run(
    input.status,
    input.outputJson,
    input.errorCode,
    input.errorMessage,
    input.now,
    input.id,
  );
}

export function listRunSteps(runId: string): RunStepRow[] {
  return db
    .prepare(
      `SELECT * FROM automation_run_steps
       WHERE run_id = ?
       ORDER BY step_index ASC`,
    )
    .all(runId) as unknown as RunStepRow[];
}

export function countActiveTriggers(userId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM automation_triggers
       WHERE user_id = ? AND enabled = 1 AND deleted_at IS NULL`,
    )
    .get(userId) as { count: number };
  return row.count;
}
