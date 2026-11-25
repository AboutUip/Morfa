import type { TFunction } from "i18next";

import { ApiError } from "./api";

const API_ERROR_KEYS: Record<string, string> = {
  NETWORK_ERROR: "auth.errors.network",
  INVALID_INPUT: "auth.errors.invalidInput",
  INVALID_REQUEST: "auth.errors.invalidInput",
  UNKNOWN: "auth.errors.unknown",
  UNAUTHORIZED: "profile.errors.unauthorized",
  ACCOUNT_TAKEN: "auth.errors.accountTaken",
  ACCOUNT_INVALID: "auth.errors.accountInvalid",
  ACCOUNT_CANCELLED: "auth.errors.accountCancelled",
  NICKNAME_INVALID: "auth.errors.nicknameTooLong",
  PASSWORD_INVALID: "auth.errors.passwordTooShort",
  PASSWORD_MISMATCH: "auth.errors.passwordMismatch",
  AVATAR_REQUIRED: "auth.errors.avatarRequired",
  AVATAR_TYPE: "auth.errors.avatarType",
  AVATAR_TOO_LARGE: "auth.errors.avatarTooLarge",
  INVALID_CREDENTIALS: "auth.errors.invalidCredentials",
  CURRENT_PASSWORD_REQUIRED: "profile.errors.currentPasswordRequired",
  CURRENT_PASSWORD_INVALID: "profile.errors.currentPasswordInvalid",
  VCODE_REQUIRED: "vcode.errors.required",
  VCODE_INVALID: "vcode.errors.invalidFormat",
  VCODE_MISMATCH: "vcode.errors.mismatch",
  VCODE_NOT_SET: "vcode.errors.notSet",
  VCODE_RATE_LIMITED: "vcode.errors.rateLimited",
  SETUP_TOKEN_INVALID: "vcode.errors.setupExpired",
  TICKET_INVALID: "vcode.errors.expired",
  IMPORT_ACCOUNT_REQUIRED: "auth.import.accountRequired",
  IMPORT_ARCHIVE_REQUIRED: "auth.import.archiveRequired",
  ORIGINAL_ACCOUNT_NOT_FOUND: "auth.import.originalAccountNotFound",
  ORIGINAL_ACCOUNT_ACTIVE: "auth.import.originalAccountActive",
  EXPORT_NOT_FOUND: "auth.import.exportNotFound",
  EXPORT_CONSUMED: "auth.import.exportConsumed",
  EXPORT_INVALIDATED: "auth.import.exportInvalidated",
  EXPORT_FILE_MISSING: "profile.errors.exportFileMissing",
  ARCHIVE_CORRUPTED: "auth.import.archiveCorrupted",
  ARCHIVE_MISMATCH: "auth.import.archiveMismatch",
  ARCHIVE_UNSUPPORTED_VERSION: "auth.import.archiveUnsupportedVersion",
  ARCHIVE_TOO_LARGE: "auth.import.archiveTooLarge",
  FILE_TOO_LARGE: "auth.import.archiveTooLarge",
  EXPORT_KEY_INVALID: "profile.errors.exportFailed",
  EXPORT_FILE_INVALID: "profile.errors.exportFailed",
};

export function apiErrorKey(error: unknown, fallbackKey: string): string {
  if (error instanceof ApiError) {
    return API_ERROR_KEYS[error.code] ?? fallbackKey;
  }

  return fallbackKey;
}

export function apiErrorMessage(
  t: TFunction,
  error: unknown,
  fallbackKey: string,
): string {
  return t(apiErrorKey(error, fallbackKey));
}
