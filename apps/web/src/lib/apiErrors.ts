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
  PROVIDER_PROTOCOL_INVALID: "profile.models.errors.protocolInvalid",
  PROVIDER_NAME_INVALID: "profile.models.errors.nameInvalid",
  PROVIDER_BASE_URL_INVALID: "profile.models.errors.baseUrlInvalid",
  PROVIDER_KEY_REQUIRED: "profile.models.errors.keyRequired",
  PROVIDER_NOT_FOUND: "profile.models.errors.notFound",
  PROVIDER_AUTH_FAILED: "profile.models.errors.authFailed",
  PROVIDER_UNREACHABLE: "profile.models.errors.unreachable",
  PROVIDER_TIMEOUT: "profile.models.errors.timeout",
  PROVIDER_FETCH_FAILED: "profile.models.errors.fetchFailed",
  PROVIDER_RESPONSE_INVALID: "profile.models.errors.responseInvalid",
  SECRET_CORRUPT: "profile.models.errors.keyCorrupt",
  MODEL_NOT_FOUND: "profile.models.errors.modelNotFound",
  MODEL_THINKING_UNSUPPORTED: "profile.models.errors.thinkingUnsupported",
  MODEL_AUTH_FAILED: "profile.models.errors.authFailed",
  MODEL_TIMEOUT: "profile.models.errors.timeout",
  MODEL_REQUEST_FAILED: "profile.models.errors.testFailed",
  MODEL_EMPTY_RESPONSE: "profile.models.errors.emptyResponse",
  MODEL_STREAM_INVALID: "profile.models.errors.streamInvalid",
  MODEL_UNREACHABLE: "profile.models.errors.unreachable",
  API_KEY_LIMIT_REACHED: "profile.api.errors.limitReached",
  API_KEY_NAME_INVALID: "profile.api.errors.nameInvalid",
  API_KEY_NOT_FOUND: "profile.api.errors.notFound",
  API_KEY_CREATE_FAILED: "profile.api.errors.createFailed",
  MCP_CAPABILITY_NOT_FOUND: "profile.api.errors.capabilityNotFound",
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
