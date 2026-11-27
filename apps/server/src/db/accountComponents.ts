import { randomUUID } from "node:crypto";

import { db } from "./connection.js";

export interface AccountComponentRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  target: string;
  pages_json: string;
  root_control_id: string;
  state_count: number;
  source_project_id: string | null;
  source_control_id: string | null;
  created_at: number;
  updated_at: number;
}

export function listAccountComponentRows(
  userId: string,
): AccountComponentRow[] {
  return db
    .prepare(
      `SELECT * FROM account_components
       WHERE user_id = ?
       ORDER BY updated_at DESC, id DESC`,
    )
    .all(userId) as unknown as AccountComponentRow[];
}

export function findAccountComponentRow(
  userId: string,
  id: string,
): AccountComponentRow | undefined {
  return db
    .prepare(
      "SELECT * FROM account_components WHERE user_id = ? AND id = ? LIMIT 1",
    )
    .get(userId, id) as unknown as AccountComponentRow | undefined;
}

export function findAccountComponentForSource(
  userId: string,
  projectId: string,
  controlId: string,
): AccountComponentRow | undefined {
  return db
    .prepare(
      `SELECT * FROM account_components
       WHERE user_id = ? AND source_project_id = ? AND source_control_id = ?
       LIMIT 1`,
    )
    .get(userId, projectId, controlId) as unknown as
    | AccountComponentRow
    | undefined;
}

export function insertAccountComponent(input: {
  userId: string;
  name: string;
  description: string;
  target: string;
  pagesJson: string;
  rootControlId: string;
  stateCount: number;
  sourceProjectId?: string;
  sourceControlId?: string;
  now: number;
}) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO account_components
      (id, user_id, name, description, target, pages_json, root_control_id,
       state_count, source_project_id, source_control_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.name,
    input.description,
    input.target,
    input.pagesJson,
    input.rootControlId,
    input.stateCount,
    input.sourceProjectId ?? null,
    input.sourceControlId ?? null,
    input.now,
    input.now,
  );
  return id;
}

export function updateAccountComponent(input: {
  userId: string;
  id: string;
  name: string;
  description: string;
  target: string;
  pagesJson: string;
  rootControlId: string;
  stateCount: number;
  now: number;
}): boolean {
  const result = db
    .prepare(
      `UPDATE account_components
       SET name = ?, description = ?, target = ?, pages_json = ?,
           root_control_id = ?, state_count = ?, updated_at = ?
       WHERE user_id = ? AND id = ?`,
    )
    .run(
      input.name,
      input.description,
      input.target,
      input.pagesJson,
      input.rootControlId,
      input.stateCount,
      input.now,
      input.userId,
      input.id,
    );
  return Number(result.changes) === 1;
}

export function deleteAccountComponentRow(
  userId: string,
  id: string,
): boolean {
  const result = db
    .prepare("DELETE FROM account_components WHERE user_id = ? AND id = ?")
    .run(userId, id);
  return Number(result.changes) === 1;
}
