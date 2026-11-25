import { db } from "./connection.js";

export interface ExportRow {
  id: string;
  user_id: string;
  original_login_account: string;
  file_name: string;
  file_size: number;
  sha256: string;
  crypto_json: string;
  format_version: number;
  created_at: number;
  invalidated_at: number | null;
  consumed_at: number | null;
  consumed_by_user_id: string | null;
}

const EXPORT_COLUMNS = `
  id, user_id, original_login_account, file_name, file_size, sha256,
  crypto_json, format_version, created_at, invalidated_at, consumed_at,
  consumed_by_user_id
`;

export function findValidExportByUser(userId: string): ExportRow | undefined {
  return db
    .prepare(
      `SELECT ${EXPORT_COLUMNS}
       FROM exports
       WHERE user_id = ? AND invalidated_at IS NULL AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId) as unknown as ExportRow | undefined;
}

export function findLatestExportByAccount(
  loginAccount: string,
): ExportRow | undefined {
  return db
    .prepare(
      `SELECT ${EXPORT_COLUMNS}
       FROM exports
       WHERE original_login_account = ? COLLATE NOCASE
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(loginAccount) as unknown as ExportRow | undefined;
}

export function invalidateValidExportsForUser(
  userId: string,
  now: number,
): ExportRow[] {
  const rows = db
    .prepare(
      `SELECT ${EXPORT_COLUMNS}
       FROM exports
       WHERE user_id = ? AND invalidated_at IS NULL AND consumed_at IS NULL`,
    )
    .all(userId) as unknown as ExportRow[];

  if (rows.length > 0) {
    db.prepare(
      `UPDATE exports SET invalidated_at = ?
       WHERE user_id = ? AND invalidated_at IS NULL AND consumed_at IS NULL`,
    ).run(now, userId);
  }

  return rows;
}

export function insertExport(input: {
  id: string;
  userId: string;
  originalLoginAccount: string;
  fileName: string;
  fileSize: number;
  sha256: string;
  cryptoJson: string;
  formatVersion: number;
  createdAt: number;
}) {
  db.prepare(
    `INSERT INTO exports
      (id, user_id, original_login_account, file_name, file_size, sha256,
       crypto_json, format_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    input.originalLoginAccount,
    input.fileName,
    input.fileSize,
    input.sha256,
    input.cryptoJson,
    input.formatVersion,
    input.createdAt,
  );
}

export function markExportConsumed(input: {
  exportId: string;
  newUserId: string;
  now: number;
}): boolean {
  const result = db
    .prepare(
      `UPDATE exports
       SET consumed_at = ?, consumed_by_user_id = ?
       WHERE id = ? AND consumed_at IS NULL AND invalidated_at IS NULL`,
    )
    .run(input.now, input.newUserId, input.exportId);

  return Number(result.changes) === 1;
}
