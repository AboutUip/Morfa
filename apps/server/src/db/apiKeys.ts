import { db } from "./connection.js";

export interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  allow_vcode: number;
  allow_password: number;
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
}

export function listApiKeysForUser(userId: string): ApiKeyRow[] {
  return db
    .prepare(
      `SELECT * FROM api_keys
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .all(userId) as unknown as ApiKeyRow[];
}

export function countApiKeysForUser(userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM api_keys WHERE user_id = ?")
    .get(userId) as { count: number };
  return row.count;
}

export function findApiKeyByHash(tokenHash: string): ApiKeyRow | undefined {
  return db
    .prepare("SELECT * FROM api_keys WHERE token_hash = ? LIMIT 1")
    .get(tokenHash) as unknown as ApiKeyRow | undefined;
}

export function findApiKeyForUser(
  userId: string,
  id: string,
): ApiKeyRow | undefined {
  return db
    .prepare("SELECT * FROM api_keys WHERE user_id = ? AND id = ? LIMIT 1")
    .get(userId, id) as unknown as ApiKeyRow | undefined;
}

export function insertApiKey(input: {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  allowVCode: boolean;
  allowPassword: boolean;
  now: number;
}) {
  db.prepare(
    `INSERT INTO api_keys
      (id, user_id, name, token_hash, token_prefix, allow_vcode,
       allow_password, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    input.name,
    input.tokenHash,
    input.tokenPrefix,
    input.allowVCode ? 1 : 0,
    input.allowPassword ? 1 : 0,
    input.now,
    input.now,
  );
}

export function updateApiKeyRecord(input: {
  userId: string;
  id: string;
  name: string;
  allowVCode: boolean;
  allowPassword: boolean;
  now: number;
}): boolean {
  const result = db
    .prepare(
      `UPDATE api_keys
       SET name = ?, allow_vcode = ?, allow_password = ?, updated_at = ?
       WHERE user_id = ? AND id = ?`,
    )
    .run(
      input.name,
      input.allowVCode ? 1 : 0,
      input.allowPassword ? 1 : 0,
      input.now,
      input.userId,
      input.id,
    );

  return Number(result.changes) === 1;
}

export function deleteApiKeyRecord(userId: string, id: string): boolean {
  const result = db
    .prepare("DELETE FROM api_keys WHERE user_id = ? AND id = ?")
    .run(userId, id);

  return Number(result.changes) === 1;
}

export function deleteApiKeysForUser(userId: string) {
  db.prepare("DELETE FROM api_keys WHERE user_id = ?").run(userId);
}

export function touchApiKeyUsed(id: string, now: number) {
  db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(
    now,
    id,
  );
}
