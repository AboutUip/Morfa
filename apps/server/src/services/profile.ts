import { deleteApiKeysForUser } from "../db/apiKeys.js";
import {
  cancelUser,
  deleteUserSessions,
  updateUserAvatar,
  updateUserNickname,
  updateUserPassword,
  type UserRow,
} from "../db/users.js";
import { transaction } from "../db/transaction.js";
import { ApiError } from "../lib/errors.js";
import { hashSecret, verifySecret } from "../lib/secret.js";
import {
  assertAvatar,
  deleteAvatar,
  saveAvatar,
} from "./avatar.js";
import { consumeTicketOrThrow } from "./vcode.js";

function validateNickname(nicknameInput: string): string {
  const nickname = nicknameInput.trim();
  if (!nickname || nickname.length > 32) {
    throw new ApiError(400, "NICKNAME_INVALID", "昵称长度需为 1–32 个字符");
  }
  return nickname;
}

function validateNewPassword(password: string) {
  if (password.length < 8 || password.length > 128) {
    throw new ApiError(400, "PASSWORD_INVALID", "密码长度需为 8–128 位");
  }
}

export async function verifyCurrentPassword(
  user: UserRow,
  password: string,
) {
  if (!password) {
    throw new ApiError(400, "CURRENT_PASSWORD_REQUIRED", "请输入当前密码");
  }

  const valid =
    user.password_hash.length > 0 &&
    (await verifySecret(password, user.password_hash));

  if (!valid) {
    throw new ApiError(
      400,
      "CURRENT_PASSWORD_INVALID",
      "当前密码不正确",
    );
  }
}

export function updateNickname(
  user: UserRow,
  nicknameInput: string,
): UserRow {
  const nickname = validateNickname(nicknameInput);
  const now = Date.now();
  updateUserNickname(user.id, nickname, now);
  return { ...user, nickname, updated_at: now };
}

export async function updateAvatar(
  user: UserRow,
  buffer: Buffer | null,
  mimeType: string,
): Promise<UserRow> {
  assertAvatar(buffer, mimeType);

  const avatarPath = await saveAvatar(buffer, mimeType);
  const now = Date.now();

  try {
    updateUserAvatar(user.id, avatarPath, now);
  } catch (error) {
    await deleteAvatar(avatarPath);
    throw error;
  }

  if (user.avatar_path !== avatarPath) {
    await deleteAvatar(user.avatar_path);
  }

  return { ...user, avatar_path: avatarPath, updated_at: now };
}

export async function changePassword(
  user: UserRow,
  currentTokenHash: string,
  input: {
    currentPassword: string;
    newPassword: string;
  },
) {
  await verifyCurrentPassword(user, input.currentPassword);
  validateNewPassword(input.newPassword);
  const passwordHash = await hashSecret(input.newPassword);
  const now = Date.now();

  transaction(() => {
    updateUserPassword(user.id, passwordHash, now);
    deleteUserSessions(user.id, currentTokenHash);
  });
}

export async function resetPassword(
  user: UserRow,
  currentTokenHash: string,
  input: {
    ticket: string;
    newPassword: string;
  },
) {
  validateNewPassword(input.newPassword);
  const passwordHash = await hashSecret(input.newPassword);
  const now = Date.now();

  transaction(() => {
    consumeTicketOrThrow(user.id, "password_reset", input.ticket);
    updateUserPassword(user.id, passwordHash, now);
    deleteUserSessions(user.id, currentTokenHash);
  });
}

export async function cancelAccount(
  user: UserRow,
  input: {
    ticket: string;
    password: string;
  },
) {
  await verifyCurrentPassword(user, input.password);

  const now = Date.now();

  transaction(() => {
    consumeTicketOrThrow(user.id, "cancel", input.ticket);
    cancelUser(user.id, now);
    deleteUserSessions(user.id);
    deleteApiKeysForUser(user.id);
  });
}
