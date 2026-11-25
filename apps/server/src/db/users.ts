import type { StatementSync } from "node:sqlite";

import { db } from "./connection.js";

export type UserStatus = "active" | "cancelled";

export interface UserRow {
  id: string;
  nickname: string;
  login_account: string;
  password_hash: string;
  vcode_hash: string | null;
  avatar_path: string;
  status: UserStatus;
  created_at: number;
  updated_at: number;
  cancelled_at: number | null;
}

interface SessionUserRow extends UserRow {
  expires_at: number;
}

const USER_COLUMNS = `
  id, nickname, login_account, password_hash, vcode_hash, avatar_path,
  status, created_at, updated_at, cancelled_at
`;

function statement(sql: string): StatementSync {
  return db.prepare(sql);
}

export function findUserByAccount(account: string): UserRow | undefined {
  return statement(
    `SELECT ${USER_COLUMNS}
     FROM users WHERE login_account = ? LIMIT 1`,
  ).get(account) as unknown as UserRow | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return statement(
    `SELECT ${USER_COLUMNS}
     FROM users WHERE id = ? LIMIT 1`,
  ).get(id) as unknown as UserRow | undefined;
}

export function findUserBySession(tokenHash: string):
  | SessionUserRow
  | undefined {
  return statement(
    `SELECT u.id, u.nickname, u.login_account, u.password_hash, u.vcode_hash,
            u.avatar_path, u.status, u.created_at, u.updated_at,
            u.cancelled_at, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
     LIMIT 1`,
  ).get(tokenHash) as unknown as SessionUserRow | undefined;
}

export function insertUser(input: {
  id: string;
  nickname: string;
  loginAccount: string;
  passwordHash: string;
  vcodeHash: string;
  avatarPath: string;
  createdAt: number;
}) {
  statement(
    `INSERT INTO users
      (id, nickname, login_account, password_hash, vcode_hash, avatar_path,
       status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(
    input.id,
    input.nickname,
    input.loginAccount,
    input.passwordHash,
    input.vcodeHash,
    input.avatarPath,
    input.createdAt,
    input.createdAt,
  );
}

export function insertSession(input: {
  tokenHash: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
}) {
  statement(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(input.tokenHash, input.userId, input.expiresAt, input.createdAt);
}

export function deleteSession(tokenHash: string) {
  statement("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function deleteUserSessions(userId: string, exceptTokenHash?: string) {
  if (exceptTokenHash) {
    statement(
      "DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?",
    ).run(userId, exceptTokenHash);
    return;
  }

  statement("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function deleteExpiredSessions() {
  statement("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}

export function updateUserNickname(
  userId: string,
  nickname: string,
  now: number,
) {
  statement(
    "UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?",
  ).run(nickname, now, userId);
}

export function updateUserAvatar(
  userId: string,
  avatarPath: string,
  now: number,
) {
  statement(
    "UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?",
  ).run(avatarPath, now, userId);
}

export function updateUserPassword(
  userId: string,
  passwordHash: string,
  now: number,
) {
  statement(
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
  ).run(passwordHash, now, userId);
}

export function updateUserVCode(
  userId: string,
  vcodeHash: string,
  now: number,
) {
  statement(
    "UPDATE users SET vcode_hash = ?, updated_at = ? WHERE id = ?",
  ).run(vcodeHash, now, userId);
}

export function cancelUser(userId: string, now: number) {
  statement(
    `UPDATE users
     SET status = 'cancelled', cancelled_at = ?, updated_at = ?,
         password_hash = '', vcode_hash = NULL
     WHERE id = ? AND status = 'active'`,
  ).run(now, now, userId);
}
