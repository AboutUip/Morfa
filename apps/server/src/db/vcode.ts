import { db } from "./connection.js";

export type TicketPurpose =
  | "password_reset"
  | "export"
  | "cancel"
  | "reveal_api_key"
  | "delete_project";

export interface SetupTokenRow {
  token_hash: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}

export function deleteSetupTokensForUser(userId: string) {
  db.prepare("DELETE FROM vcode_setup_tokens WHERE user_id = ?").run(userId);
}

export function insertSetupToken(input: {
  tokenHash: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
}) {
  db.prepare(
    `INSERT INTO vcode_setup_tokens (token_hash, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(input.tokenHash, input.userId, input.expiresAt, input.createdAt);
}

export function findSetupToken(tokenHash: string): SetupTokenRow | undefined {
  return db
    .prepare(
      `SELECT token_hash, user_id, expires_at, created_at
       FROM vcode_setup_tokens WHERE token_hash = ? LIMIT 1`,
    )
    .get(tokenHash) as unknown as SetupTokenRow | undefined;
}

export function deleteSetupToken(tokenHash: string) {
  db.prepare("DELETE FROM vcode_setup_tokens WHERE token_hash = ?").run(
    tokenHash,
  );
}

export function consumeSetupToken(tokenHash: string, now: number): boolean {
  const result = db
    .prepare(
      "DELETE FROM vcode_setup_tokens WHERE token_hash = ? AND expires_at > ?",
    )
    .run(tokenHash, now);

  return Number(result.changes) === 1;
}

export function purgeExpiredSetupTokens(now: number) {
  db.prepare("DELETE FROM vcode_setup_tokens WHERE expires_at <= ?").run(now);
}

export function insertSensitiveTicket(input: {
  tokenHash: string;
  userId: string;
  purpose: TicketPurpose;
  expiresAt: number;
  createdAt: number;
}) {
  db.prepare(
    `INSERT INTO sensitive_tickets
      (token_hash, user_id, purpose, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    input.tokenHash,
    input.userId,
    input.purpose,
    input.expiresAt,
    input.createdAt,
  );
}

export function consumeSensitiveTicket(input: {
  tokenHash: string;
  userId: string;
  purpose: TicketPurpose;
  now: number;
}): boolean {
  const result = db
    .prepare(
      `UPDATE sensitive_tickets
       SET consumed_at = ?
       WHERE token_hash = ? AND user_id = ? AND purpose = ?
         AND consumed_at IS NULL AND expires_at > ?`,
    )
    .run(input.now, input.tokenHash, input.userId, input.purpose, input.now);

  return Number(result.changes) === 1;
}

export function purgeExpiredTickets(now: number) {
  db.prepare("DELETE FROM sensitive_tickets WHERE expires_at <= ?").run(now);
}
