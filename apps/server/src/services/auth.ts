import { randomUUID } from "node:crypto";

import {
  SESSION_TTL_MS,
  VCODE_SETUP_TTL_MS,
} from "../config.js";
import {
  consumePreparedImport,
  discardPreparedImportFile,
  prepareImport,
  type PreparedImport,
} from "./dataTransfer.js";
import { transaction } from "../db/transaction.js";
import {
  deleteSession,
  findUserByAccount,
  findUserById,
  findUserBySession,
  insertSession,
  insertUser,
  updateUserVCode,
  type UserRow,
} from "../db/users.js";
import {
  consumeSetupToken,
  deleteSetupToken,
  deleteSetupTokensForUser,
  findSetupToken,
  insertSetupToken,
  purgeExpiredSetupTokens,
} from "../db/vcode.js";
import { ApiError } from "../lib/errors.js";
import {
  hashSecret,
  hashToken,
  randomToken,
  verifySecret,
} from "../lib/secret.js";
import { realtimeGateway } from "../realtime/index.js";
import {
  assertAvatar,
  avatarUrl,
  deleteAvatar,
  saveAvatar,
} from "./avatar.js";
import { assertVCodeFormat, hashVCode } from "./vcode.js";

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
  vcode: string;
  avatar: Buffer | null;
  avatarMimeType: string;
  import?: {
    originalAccount: string;
    archive: Buffer;
  };
}

export interface LoginInput {
  loginAccount: string;
  password: string;
}

export type LoginResult =
  | {
      kind: "ok";
      user: PublicUser;
      token: string;
    }
  | {
      kind: "vcode_setup_required";
      preview: PublicUser;
      setupToken: string;
      expiresAt: number;
    };

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    nickname: row.nickname,
    loginAccount: row.login_account,
    avatarUrl: avatarUrl(row.avatar_path),
    createdAt: row.created_at,
  };
}

function isUniqueAccountError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed: users\.login_account/i.test(error.message)
  );
}

function createSessionToken(userId: string): string {
  const token = randomToken();
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
): Promise<{
  user: PublicUser;
  token: string;
  importedProjectCount: number;
}> {
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

  assertVCodeFormat(input.vcode);

  const avatar = input.avatar;
  assertAvatar(avatar, input.avatarMimeType);

  if (findUserByAccount(loginAccount)) {
    throw new ApiError(409, "ACCOUNT_TAKEN", "该登录账号已被使用");
  }

  let preparedImport: PreparedImport | null = null;
  if (input.import) {
    preparedImport = prepareImport(
      input.import.originalAccount,
      input.import.archive,
    );
  }

  const userId = randomUUID();
  const createdAt = Date.now();

  const [passwordHash, vcodeHash] = await Promise.all([
    hashSecret(input.password),
    hashVCode(input.vcode),
  ]);
  const avatarPath = await saveAvatar(avatar, input.avatarMimeType);
  const sessionToken = randomToken();

  try {
    transaction(() => {
      insertUser({
        id: userId,
        nickname,
        loginAccount,
        passwordHash,
        vcodeHash,
        avatarPath,
        createdAt,
      });

      insertSession({
        tokenHash: hashToken(sessionToken),
        userId,
        expiresAt: createdAt + SESSION_TTL_MS,
        createdAt,
      });

      if (preparedImport) {
        consumePreparedImport({
          prepared: preparedImport,
          newUserId: userId,
          now: createdAt,
        });
      }
    });
  } catch (error) {
    await deleteAvatar(avatarPath);
    if (isUniqueAccountError(error)) {
      throw new ApiError(409, "ACCOUNT_TAKEN", "该登录账号已被使用");
    }
    throw error;
  }

  if (preparedImport) {
    await discardPreparedImportFile(preparedImport);
  }

  return {
    user: {
      id: userId,
      nickname,
      loginAccount,
      avatarUrl: avatarUrl(avatarPath),
      createdAt,
    },
    token: sessionToken,
    importedProjectCount: preparedImport?.projects.length ?? 0,
  };
}

export async function loginUser(input: LoginInput): Promise<LoginResult> {
  const loginAccount = input.loginAccount.trim().toLowerCase();

  if (!loginAccount || !input.password) {
    throw new ApiError(400, "INVALID_INPUT", "请输入登录账号和密码");
  }

  const row = findUserByAccount(loginAccount);

  if (!row) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "账号或密码不正确");
  }

  if (row.status !== "active") {
    throw new ApiError(
      403,
      "ACCOUNT_CANCELLED",
      "该账号已注销，无法登录",
    );
  }

  if (
    !row.password_hash ||
    !(await verifySecret(input.password, row.password_hash))
  ) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "账号或密码不正确");
  }

  if (!row.vcode_hash) {
    const now = Date.now();
    purgeExpiredSetupTokens(now);
    deleteSetupTokensForUser(row.id);

    const setupToken = randomToken();
    const expiresAt = now + VCODE_SETUP_TTL_MS;

    insertSetupToken({
      tokenHash: hashToken(setupToken),
      userId: row.id,
      expiresAt,
      createdAt: now,
    });

    return {
      kind: "vcode_setup_required",
      preview: toPublicUser(row),
      setupToken,
      expiresAt,
    };
  }

  const token = createSessionToken(row.id);
  return { kind: "ok", user: toPublicUser(row), token };
}

export async function completeVCodeSetup(input: {
  setupToken: string;
  code: string;
}): Promise<{ user: PublicUser; token: string }> {
  assertVCodeFormat(input.code);

  const tokenHash = hashToken(input.setupToken);
  const setup = findSetupToken(tokenHash);
  const now = Date.now();

  if (!setup || setup.expires_at <= now) {
    if (setup) deleteSetupToken(tokenHash);
    throw new ApiError(
      400,
      "SETUP_TOKEN_INVALID",
      "VCode 设置会话已过期，请重新登录",
    );
  }

  const row = findUserById(setup.user_id);
  if (!row || row.status !== "active") {
    deleteSetupToken(tokenHash);
    throw new ApiError(403, "ACCOUNT_CANCELLED", "该账号无法继续使用");
  }

  const vcodeHash = await hashVCode(input.code);
  const sessionToken = randomToken();

  transaction(() => {
    if (!consumeSetupToken(tokenHash, now)) {
      throw new ApiError(
        400,
        "SETUP_TOKEN_INVALID",
        "VCode 设置会话已过期，请重新登录",
      );
    }

    updateUserVCode(row.id, vcodeHash, now);
    deleteSetupTokensForUser(row.id);
    insertSession({
      tokenHash: hashToken(sessionToken),
      userId: row.id,
      expiresAt: now + SESSION_TTL_MS,
      createdAt: now,
    });
  });

  return {
    user: toPublicUser({ ...row, vcode_hash: vcodeHash, updated_at: now }),
    token: sessionToken,
  };
}

export interface SessionUser {
  row: UserRow;
  tokenHash: string;
}

export function getSessionUser(token: string | null): SessionUser | null {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const row = findUserBySession(tokenHash);
  if (!row) return null;

  if (row.expires_at <= Date.now()) {
    deleteSession(tokenHash);
    return null;
  }

  return { row, tokenHash };
}

export function requireActiveUser(token: string | null): SessionUser {
  const session = getSessionUser(token);
  if (!session) {
    throw new ApiError(401, "UNAUTHORIZED", "请先登录");
  }

  if (
    session.row.status !== "active" ||
    !session.row.vcode_hash
  ) {
    deleteSession(session.tokenHash);
    throw new ApiError(401, "UNAUTHORIZED", "请重新登录");
  }

  return session;
}

export function logout(token: string | null) {
  if (!token) return;
  const session = getSessionUser(token);
  deleteSession(hashToken(token));
  if (session) {
    realtimeGateway.closeUserConnections(session.row.id, "LOGOUT");
  }
}
