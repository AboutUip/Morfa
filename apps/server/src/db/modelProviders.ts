import { db } from "./connection.js";

export type ProviderProtocol = "openai" | "anthropic";

export interface ProviderRow {
  id: string;
  user_id: string;
  name: string;
  protocol: ProviderProtocol;
  base_url: string;
  api_key_cipher: string;
  created_at: number;
  updated_at: number;
  last_synced_at: number | null;
}

export interface ProviderModelRow {
  model_id: string;
  display_name: string | null;
  created_at: number | null;
  supports_streaming: boolean;
  supports_thinking: boolean;
  supports_multimodal: boolean;
}

export interface ProviderWithModels {
  provider: ProviderRow;
  models: ProviderModelRow[];
}

interface JoinedRow extends ProviderRow {
  model_id: string | null;
  display_name: string | null;
  model_created_at: number | null;
  supports_streaming: number | null;
  supports_thinking: number | null;
  supports_multimodal: number | null;
}

const PROVIDER_COLUMNS = `
  p.id, p.user_id, p.name, p.protocol, p.base_url, p.api_key_cipher,
  p.created_at, p.updated_at, p.last_synced_at
`;

function groupRows(rows: JoinedRow[]): ProviderWithModels[] {
  const grouped = new Map<string, ProviderWithModels>();

  for (const row of rows) {
    let entry = grouped.get(row.id);
    if (!entry) {
      entry = {
        provider: {
          id: row.id,
          user_id: row.user_id,
          name: row.name,
          protocol: row.protocol,
          base_url: row.base_url,
          api_key_cipher: row.api_key_cipher,
          created_at: row.created_at,
          updated_at: row.updated_at,
          last_synced_at: row.last_synced_at,
        },
        models: [],
      };
      grouped.set(row.id, entry);
    }

    if (row.model_id) {
      entry.models.push({
        model_id: row.model_id,
        display_name: row.display_name,
        created_at: row.model_created_at,
        supports_streaming: row.supports_streaming !== 0,
        supports_thinking: row.supports_thinking === 1,
        supports_multimodal: row.supports_multimodal === 1,
      });
    }
  }

  return [...grouped.values()];
}

export function listProvidersWithModels(
  userId: string,
): ProviderWithModels[] {
  const rows = db
    .prepare(
      `SELECT ${PROVIDER_COLUMNS},
              m.model_id, m.display_name,
              m.created_at AS model_created_at,
              m.supports_streaming, m.supports_thinking,
              m.supports_multimodal
       FROM model_providers p
       LEFT JOIN model_provider_models m ON m.provider_id = p.id
       WHERE p.user_id = ?
       ORDER BY p.created_at ASC, m.model_id ASC`,
    )
    .all(userId) as unknown as JoinedRow[];

  return groupRows(rows);
}

export function findProviderWithModels(
  userId: string,
  providerId: string,
): ProviderWithModels | undefined {
  const rows = db
    .prepare(
      `SELECT ${PROVIDER_COLUMNS},
              m.model_id, m.display_name,
              m.created_at AS model_created_at,
              m.supports_streaming, m.supports_thinking,
              m.supports_multimodal
       FROM model_providers p
       LEFT JOIN model_provider_models m ON m.provider_id = p.id
       WHERE p.user_id = ? AND p.id = ?
       ORDER BY m.model_id ASC`,
    )
    .all(userId, providerId) as unknown as JoinedRow[];

  return groupRows(rows)[0];
}

export function findProviderForUser(
  userId: string,
  providerId: string,
): ProviderRow | undefined {
  return db
    .prepare(
      `SELECT ${PROVIDER_COLUMNS}
       FROM model_providers p
       WHERE p.user_id = ? AND p.id = ?
       LIMIT 1`,
    )
    .get(userId, providerId) as unknown as ProviderRow | undefined;
}

export function insertProvider(input: {
  id: string;
  userId: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKeyCipher: string;
  createdAt: number;
}) {
  db.prepare(
    `INSERT INTO model_providers
      (id, user_id, name, protocol, base_url, api_key_cipher,
       created_at, updated_at, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.userId,
    input.name,
    input.protocol,
    input.baseUrl,
    input.apiKeyCipher,
    input.createdAt,
    input.createdAt,
    input.createdAt,
  );
}

export function insertProviderModels(
  providerId: string,
  models: Array<{
    modelId: string;
    displayName: string | null;
    createdAt: number | null;
    supportsStreaming: boolean;
    supportsThinking: boolean;
    supportsMultimodal: boolean;
  }>,
) {
  const statement = db.prepare(
    `INSERT INTO model_provider_models
      (provider_id, model_id, display_name, created_at,
       supports_streaming, supports_thinking, supports_multimodal)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const model of models) {
    statement.run(
      providerId,
      model.modelId,
      model.displayName,
      model.createdAt,
      model.supportsStreaming ? 1 : 0,
      model.supportsThinking ? 1 : 0,
      model.supportsMultimodal ? 1 : 0,
    );
  }
}

export function deleteProviderModels(providerId: string) {
  db.prepare(
    "DELETE FROM model_provider_models WHERE provider_id = ?",
  ).run(providerId);
}

export function updateProviderSynced(
  providerId: string,
  now: number,
) {
  db.prepare(
    `UPDATE model_providers
     SET updated_at = ?, last_synced_at = ?
     WHERE id = ?`,
  ).run(now, now, providerId);
}

export function updateProviderModelCapabilities(input: {
  providerId: string;
  modelId: string;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  supportsMultimodal: boolean;
}): boolean {
  const result = db
    .prepare(
      `UPDATE model_provider_models
       SET supports_streaming = ?, supports_thinking = ?,
           supports_multimodal = ?
       WHERE provider_id = ? AND model_id = ?`,
    )
    .run(
      input.supportsStreaming ? 1 : 0,
      input.supportsThinking ? 1 : 0,
      input.supportsMultimodal ? 1 : 0,
      input.providerId,
      input.modelId,
    );

  return Number(result.changes) === 1;
}

export function touchProvider(providerId: string, now: number) {
  db.prepare(
    "UPDATE model_providers SET updated_at = ? WHERE id = ?",
  ).run(now, providerId);
}

export function deleteProviderRecord(
  userId: string,
  providerId: string,
): boolean {
  const result = db
    .prepare("DELETE FROM model_providers WHERE id = ? AND user_id = ?")
    .run(providerId, userId);

  return Number(result.changes) === 1;
}
