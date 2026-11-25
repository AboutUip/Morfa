import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import { SESSION_TTL_MS } from "../config.js";
import {
  deleteExpiredSessions,
  deleteSession,
  findUserByAccount,
  findUserBySession,
  insertSession,
  insertUserWithSession,
  type UserRow,
} from "../db/users.js";
import { ApiError } from "../lib/errors.js";
import {
  assertAvatar,
  avatarUrl,
  deleteAvatar,
  saveAvatar,
} from "./avatar.js";

const scrypt = promisify(scryptCallback);
const ACCOUNT_PATTERN = /^[a-z0-9_.-]{3,32}$/i;

export interface PublicUser {
  id: string;
  nickname: string;
  loginAccount: string;
  avatarUrl: string;
  createdAt: number;
}

export interface RegisterInput {
  nickname: string;
  loginAccount: string;
  password: string;
  confirmPassword: string;
  avatar: Buffer | null;
  avatarMimeType: string;
}

export interface LoginInput {
  loginAccount: string;
  password: string;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
  )) as Buffer;

  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

function isUniqueAccountError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed: users\.login_account/i.test(error.message)
  );
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    nickname: row.nickname,
    loginAccount: row.login_account,
    avatarUrl: avatarUrl(row.avatar_path),
    createdAt: row.created_at,
  };
}

function createSessionToken(userId: string): string {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();

  insertSession({
    tokenHash: hashToken(token),
    userId,
    expiresAt: now + SESSION_TTL_MS,
    createdAt: now,
  });

  return token;
}

export async function registerUser(
  input: RegisterInput,
): Promise<{ user: PublicUser; token: string }> {
  const nickname = input.nickname.trim();
  const loginAccount = input.loginAccount.trim().toLowerCase();

  if (!nickname || nickname.length > 32) {
    throw new ApiError(400, "NICKNAME_INVALID", "昵称长度需为 1–32 个字符");
  }

  if (!ACCOUNT_PATTERN.test(loginAccount)) {
    throw new ApiError(
      400,
      "ACCOUNT_INVALID",
      "登录账号需为 3–32 位字母、数字、下划线、点或短横线",
    );
  }

  if (input.password.length < 8 || input.password.length > 128) {
    throw new ApiError(400, "PASSWORD_INVALID", "密码长度需为 8–128 位");
  }

  if (input.password !== input.confirmPassword) {
    throw new ApiError(400, "PASSWORD_MISMATCH", "两次输入的密码不一致");
  }

  const avatar = input.avatar;
  assertAvatar(avatar, input.avatarMimeType);

  if (findUserByAccount(loginAccount)) {
    throw new ApiError(409, "ACCOUNT_TAKEN", "该登录账号已被使用");
  }

  const userId = randomUUID();
  const passwordHash = await hashPassword(input.password);
  const avatarPath = await saveAvatar(userId, avatar, input.avatarMimeType);
  const createdAt = Date.now();
  const token = randomBytes(32).toString("base64url");

  try {
    insertUserWithSession({
      user: {
        id: userId,
        nickname,
        loginAccount,
        passwordHash,
        avatarPath,
        createdAt,
      },
      session: {
        tokenHash: hashToken(token),
        expiresAt: createdAt + SESSION_TTL_MS,
        createdAt,
      },
    });
  } catch (error) {
    await deleteAvatar(avatarPath);
    if (isUniqueAccountError(error)) {
      throw new ApiError(409, "ACCOUNT_TAKEN", "该登录账号已被使用");
    }
    throw error;
  }

  return {
    user: {
      id: userId,
      nickname,
      loginAccount,
      avatarUrl: avatarUrl(avatarPath),
      createdAt,
    },
    token,
  };
}

export async function loginUser(
  input: LoginInput,
): Promise<{ user: PublicUser; token: string }> {
  const loginAccount = input.loginAccount.trim().toLowerCase();

  if (!loginAccount || !input.password) {
    throw new ApiError(400, "INVALID_INPUT", "请输入登录账号和密码");
  }

  const row = findUserByAccount(loginAccount);
  if (!row || !(await verifyPassword(input.password, row.password_hash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "账号或密码不正确");
  }

  deleteExpiredSessions();
  const token = createSessionToken(row.id);

  return { user: toPublicUser(row), token };
}

export function getUserBySession(token: string | null): PublicUser | null {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const row = findUserBySession(tokenHash);
  if (!row) return null;

  if (row.expires_at <= Date.now()) {
    deleteSession(tokenHash);
    return null;
  }

  return toPublicUser(row);
}

export function logout(token: string | null) {
  if (!token) return;
  deleteSession(hashToken(token));
}
