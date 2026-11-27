import { db } from "./connection.js";

export interface ProjectAssetRow {
  id: string;
  project_id: string;
  name: string;
  storage_name: string;
  mime_type: string;
  size: number;
  created_at: number;
}

const PROJECT_ASSET_COLUMNS = `
  id, project_id, name, storage_name, mime_type, size, created_at
`;

export function listProjectAssetRows(
  projectId: string,
): ProjectAssetRow[] {
  return db
    .prepare(
      `SELECT ${PROJECT_ASSET_COLUMNS}
       FROM project_assets
       WHERE project_id = ?
       ORDER BY created_at DESC, rowid DESC`,
    )
    .all(projectId) as unknown as ProjectAssetRow[];
}

export function findProjectAssetRow(
  projectId: string,
  assetId: string,
): ProjectAssetRow | undefined {
  return db
    .prepare(
      `SELECT ${PROJECT_ASSET_COLUMNS}
       FROM project_assets
       WHERE project_id = ? AND id = ?
       LIMIT 1`,
    )
    .get(projectId, assetId) as unknown as ProjectAssetRow | undefined;
}

export function insertProjectAssetRecord(input: {
  id: string;
  projectId: string;
  name: string;
  storageName: string;
  mimeType: string;
  size: number;
  createdAt: number;
}) {
  db.prepare(
    `INSERT INTO project_assets
      (id, project_id, name, storage_name, mime_type, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.projectId,
    input.name,
    input.storageName,
    input.mimeType,
    input.size,
    input.createdAt,
  );
}

export function deleteProjectAssetRecord(
  projectId: string,
  assetId: string,
): ProjectAssetRow | undefined {
  const row = findProjectAssetRow(projectId, assetId);
  if (!row) return undefined;

  db.prepare(
    "DELETE FROM project_assets WHERE project_id = ? AND id = ?",
  ).run(projectId, assetId);
  return row;
}

export function listProjectAssetStorageNames(
  projectId: string,
): string[] {
  return (
    db
      .prepare(
        "SELECT storage_name FROM project_assets WHERE project_id = ?",
      )
      .all(projectId) as unknown as { storage_name: string }[]
  ).map((row) => row.storage_name);
}
