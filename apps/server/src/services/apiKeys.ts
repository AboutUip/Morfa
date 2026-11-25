import { randomUUID } from "node:crypto";

import {
  countApiKeysForUser,
  deleteApiKeyRecord,
  findApiKeyByHash,
  findApiKeyForUser,
  insertApiKey,
  listApiKeysForUser,
  touchApiKeyUsed,
  updateApiKeyRecord,
  type ApiKeyRow,
} from "../db/apiKeys.js";
import { findUserById, type UserRow } from "../db/users.js";
import { ApiError } from "../lib/errors.js";
import { hashToken, randomToken } from "../lib/secret.js";

const MAX_API_KEYS = 20;
const MAX_API_KEY_NAME = 60;
const TOKEN_PREFIX = "mf_";
const LAST_USED_THROTTLE_MS = 60_000;

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  allowVCode: boolean;
  allowPassword: boolean;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AuthenticatedApiKey {
  key: ApiKeyRow;
  user: UserRow;
}

function toDto(row: ApiKeyRow): ApiKeyDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.token_prefix,
    allowVCode: row.allow_vcode === 1,
    allowPassword: row.allow_password === 1,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeName(value: string): string {
  const name = value.trim();
  if (!name) return "MCP Key";
  if (name.length > MAX_API_KEY_NAME) {
    throw new ApiError(
      400,
      "API_KEY_NAME_INVALID",
      "API Key 名称不能超过 60 个字符",
    );
  }
  return name;
}

function buildToken() {
  const token = `${TOKEN_PREFIX}${randomToken()}`;
  return {
    token,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, 11),
  };
}

export function listApiKeys(userId: string): ApiKeyDto[] {
  return listApiKeysForUser(userId).map(toDto);
}

export function createApiKey(
  userId: string,
  input: { name: string; allowVCode: boolean; allowPassword: boolean },
): { key: ApiKeyDto; token: string } {
  if (countApiKeysForUser(userId) >= MAX_API_KEYS) {
    throw new ApiError(
      409,
      "API_KEY_LIMIT_REACHED",
      `最多只能创建 ${MAX_API_KEYS} 个 API Key`,
    );
  }

  const name = normalizeName(input.name);
  const now = Date.now();
  const id = randomUUID();
  const { token, tokenHash, tokenPrefix } = buildToken();

  insertApiKey({
    id,
    userId,
    name,
    tokenHash,
    tokenPrefix,
    allowVCode: input.allowVCode,
    allowPassword: input.allowPassword,
    now,
  });

  const row = findApiKeyForUser(userId, id);
  if (!row) {
    throw new ApiError(500, "API_KEY_CREATE_FAILED", "API Key 创建失败");
  }

  return { key: toDto(row), token };
}

export function updateApiKey(
  userId: string,
  keyId: string,
  input: {
    name?: string;
    allowVCode?: boolean;
    allowPassword?: boolean;
  },
): ApiKeyDto {
  const existing = findApiKeyForUser(userId, keyId);
  if (!existing) {
    throw new ApiError(404, "API_KEY_NOT_FOUND", "API Key 不存在");
  }

  const name =
    input.name === undefined ? existing.name : normalizeName(input.name);
  const allowVCode = input.allowVCode ?? existing.allow_vcode === 1;
  const allowPassword =
    input.allowPassword ?? existing.allow_password === 1;

  const now = Date.now();
  const updated = updateApiKeyRecord({
    userId,
    id: keyId,
    name,
    allowVCode,
    allowPassword,
    now,
  });

  if (!updated) {
    throw new ApiError(404, "API_KEY_NOT_FOUND", "API Key 不存在");
  }

  const row = findApiKeyForUser(userId, keyId);
  if (!row) {
    throw new ApiError(404, "API_KEY_NOT_FOUND", "API Key 不存在");
  }
  return toDto(row);
}

export function removeApiKey(userId: string, keyId: string) {
  if (!deleteApiKeyRecord(userId, keyId)) {
    throw new ApiError(404, "API_KEY_NOT_FOUND", "API Key 不存在");
  }
}

export function authenticateApiKeyToken(
  token: string | null,
): AuthenticatedApiKey {
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    throw new ApiError(401, "API_KEY_INVALID", "API Key 无效");
  }

  const row = findApiKeyByHash(hashToken(token));
  if (!row) {
    throw new ApiError(401, "API_KEY_INVALID", "API Key 无效");
  }

  const user = findUserById(row.user_id);
  if (!user || user.status !== "active" || !user.vcode_hash) {
    throw new ApiError(403, "API_KEY_ACCOUNT_INACTIVE", "账号当前不可用");
  }

  const now = Date.now();
  if (!row.last_used_at || now - row.last_used_at > LAST_USED_THROTTLE_MS) {
    touchApiKeyUsed(row.id, now);
  }

  return { key: row, user };
}


