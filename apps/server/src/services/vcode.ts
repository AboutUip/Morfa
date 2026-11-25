import { SENSITIVE_TICKET_TTL_MS } from "../config.js";
import {
  consumeSensitiveTicket,
  insertSensitiveTicket,
  type TicketPurpose,
} from "../db/vcode.js";
export type { TicketPurpose } from "../db/vcode.js";
import type { UserRow } from "../db/users.js";
import { ApiError } from "../lib/errors.js";
import {
  hashSecret,
  hashToken,
  randomToken,
  verifySecret,
} from "../lib/secret.js";

export const VCODE_PATTERN = /^\d{6}$/;

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

interface AttemptState {
  count: number;
  resetAt: number;
}

function readAttempts(userId: string): AttemptState | null {
  const state = attempts.get(userId);
  if (!state) return null;
  if (state.resetAt <= Date.now()) {
    attempts.delete(userId);
    return null;
  }
  return state;
}

function assertAttemptAllowed(userId: string) {
  const state = readAttempts(userId);
  if (state && state.count >= MAX_ATTEMPTS) {
    throw new ApiError(
      429,
      "VCODE_RATE_LIMITED",
      "VCode 尝试次数过多，请稍后再试",
    );
  }
}

function recordFailure(userId: string) {
  const state = readAttempts(userId);
  attempts.set(userId, {
    count: (state?.count ?? 0) + 1,
    resetAt: state?.resetAt ?? Date.now() + ATTEMPT_WINDOW_MS,
  });
}

function clearFailures(userId: string) {
  attempts.delete(userId);
}

export function assertVCodeFormat(code: string) {
  if (!VCODE_PATTERN.test(code)) {
    throw new ApiError(400, "VCODE_INVALID", "VCode 必须是 6 位数字");
  }
}

export function hashVCode(code: string): Promise<string> {
  assertVCodeFormat(code);
  return hashSecret(code);
}

export async function verifyVCodeForUser(
  user: UserRow,
  code: string,
  purpose: TicketPurpose,
): Promise<{ ticket: string; expiresAt: number }> {
  if (!VCODE_PATTERN.test(code)) {
    throw new ApiError(400, "VCODE_INVALID", "VCode 必须是 6 位数字");
  }

  if (!user.vcode_hash) {
    throw new ApiError(409, "VCODE_NOT_SET", "当前账号还没有设置 VCode");
  }

  assertAttemptAllowed(user.id);

  const valid = await verifySecret(code, user.vcode_hash);
  if (!valid) {
    recordFailure(user.id);
    await new Promise((resolve) => setTimeout(resolve, 250));
    throw new ApiError(400, "VCODE_MISMATCH", "VCode 不正确");
  }

  clearFailures(user.id);

  const ticket = randomToken();
  const now = Date.now();
  const expiresAt = now + SENSITIVE_TICKET_TTL_MS;

  insertSensitiveTicket({
    tokenHash: hashToken(ticket),
    userId: user.id,
    purpose,
    expiresAt,
    createdAt: now,
  });

  return { ticket, expiresAt };
}

export function consumeTicketOrThrow(
  userId: string,
  purpose: TicketPurpose,
  ticket: string,
) {
  if (!ticket) {
    throw new ApiError(
      400,
      "TICKET_INVALID",
      "验证已过期，请重新验证 VCode",
    );
  }

  const consumed = consumeSensitiveTicket({
    tokenHash: hashToken(ticket),
    userId,
    purpose,
    now: Date.now(),
  });

  if (!consumed) {
    throw new ApiError(
      400,
      "TICKET_INVALID",
      "验证已过期，请重新验证 VCode",
    );
  }
}
