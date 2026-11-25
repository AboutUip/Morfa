import type { StatementSync } from "node:sqlite";

import { db } from "./connection.js";

export interface UserRow {
  id: string;
  nickname: string;
  login_account: string;
  password_hash: string;
  avatar_path: string;
  created_at: number;
  updated_at: number;
}

interface SessionUserRow extends UserRow {
  expires_at: number;
}

function statement(sql: string): StatementSync {
  return db.prepare(sql);
}

export function findUserByAccount(account: string): UserRow | undefined {
  return statement(
    `SELECT id, nickname, login_account, password_hash, avatar_path, created_at, updated_at
     FROM users WHERE login_account = ? LIMIT 1`,
  ).get(account) as unknown as UserRow | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return statement(
    `SELECT id, nickname, login_account, password_hash, avatar_path, created_at, updated_at
     FROM users WHERE id = ? LIMIT 1`,
  ).get(id) as unknown as UserRow | undefined;
}

export function findUserBySession(tokenHash: string):
  | SessionUserRow
  | undefined {
  return statement(
    `SELECT u.id, u.nickname, u.login_account, u.password_hash, u.avatar_path,
            u.created_at, u.updated_at, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
     LIMIT 1`,
  ).get(tokenHash) as unknown as SessionUserRow | undefined;
}

export function insertUserWithSession(input: {
  user: {
    id: string;
    nickname: string;
    loginAccount: string;
    passwordHash: string;
    avatarPath: string;
    createdAt: number;
  };
  session: {
    tokenHash: string;
    expiresAt: number;
    createdAt: number;
  };
}) {
  db.exec("BEGIN IMMEDIATE;");
  try {
    statement(
      `INSERT INTO users
        (id, nickname, login_account, password_hash, avatar_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.user.id,
      input.user.nickname,
      input.user.loginAccount,
      input.user.passwordHash,
      input.user.avatarPath,
      input.user.createdAt,
      input.user.createdAt,
    );

    statement(
      `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(
      input.session.tokenHash,
      input.user.id,
      input.session.expiresAt,
      input.session.createdAt,
    );

    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
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

export function deleteExpiredSessions() {
  statement("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}
