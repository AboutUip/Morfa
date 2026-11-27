import { randomUUID } from "node:crypto";

import { db } from "./connection.js";

const SCREENSHOT_AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface ScreenshotAuditRow {
  id: string;
  user_id: string;
  api_key_id: string | null;
  project_id: string;
  mode: string;
  page_id: string | null;
  scale: number;
  cache_hit: number;
  status: string;
  error_code: string | null;
  bytes: number;
  duration_ms: number;
  artifact_token: string | null;
  created_at: number;
}

export interface ScreenshotAuditInput {
  userId: string;
  apiKeyId?: string;
  projectId: string;
  mode: string;
  pageId?: string;
  scale: number;
  cacheHit: boolean;
  status: "ok" | "error";
  errorCode?: string;
  bytes: number;
  durationMs: number;
  artifactToken?: string;
  now: number;
}

export function insertScreenshotAudit(input: ScreenshotAuditInput) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO screenshot_audits
      (id, user_id, api_key_id, project_id, mode, page_id, scale,
       cache_hit, status, error_code, bytes, duration_ms, artifact_token,
       created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.userId,
    input.apiKeyId ?? null,
    input.projectId,
    input.mode,
    input.pageId ?? null,
    input.scale,
    input.cacheHit ? 1 : 0,
    input.status,
    input.errorCode ?? null,
    Math.max(0, Math.round(input.bytes)),
    Math.max(0, Math.round(input.durationMs)),
    input.artifactToken ?? null,
    input.now,
  );

  db.prepare(
    "DELETE FROM screenshot_audits WHERE user_id = ? AND created_at < ?",
  ).run(input.userId, input.now - SCREENSHOT_AUDIT_RETENTION_MS);

  return id;
}

export function listScreenshotAudits(input: {
  userId: string;
  projectId?: string;
  limit: number;
}): ScreenshotAuditRow[] {
  if (input.projectId) {
    return db
      .prepare(
        `SELECT * FROM screenshot_audits
         WHERE user_id = ? AND project_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .all(
        input.userId,
        input.projectId,
        input.limit,
      ) as unknown as ScreenshotAuditRow[];
  }

  return db
    .prepare(
      `SELECT * FROM screenshot_audits
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .all(
      input.userId,
      input.limit,
    ) as unknown as ScreenshotAuditRow[];
}
