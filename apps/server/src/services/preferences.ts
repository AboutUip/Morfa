import {
  findPreferences,
  upsertPreferences,
  type PreferencesDto,
  type UserLocale,
  type UserThemeMode,
} from "../db/preferences.js";
import { ApiError } from "../lib/errors.js";

const LOCALES: UserLocale[] = ["zh-CN", "en-US"];
const THEME_MODES: UserThemeMode[] = ["system", "light", "dark"];

export function isLocale(value: unknown): value is UserLocale {
  return typeof value === "string" && LOCALES.includes(value as UserLocale);
}

export function isThemeMode(value: unknown): value is UserThemeMode {
  return (
    typeof value === "string" &&
    THEME_MODES.includes(value as UserThemeMode)
  );
}

export function getUserPreferences(userId: string): PreferencesDto {
  const row = findPreferences(userId);
  return {
    locale: row?.locale ?? null,
    themeMode: row?.theme_mode ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export function updateUserPreferences(
  userId: string,
  input: { locale?: unknown; themeMode?: unknown },
): PreferencesDto {
  if (input.locale !== undefined && !isLocale(input.locale)) {
    throw new ApiError(400, "PREFERENCE_LOCALE_INVALID", "语言设置不正确");
  }

  if (input.themeMode !== undefined && !isThemeMode(input.themeMode)) {
    throw new ApiError(
      400,
      "PREFERENCE_THEME_INVALID",
      "主题设置不正确",
    );
  }

  if (input.locale === undefined && input.themeMode === undefined) {
    throw new ApiError(
      400,
      "PREFERENCE_EMPTY",
      "至少需要更新一项偏好设置",
    );
  }

  const row = upsertPreferences({
    userId,
    locale: (input.locale as UserLocale | undefined) ?? null,
    themeMode: (input.themeMode as UserThemeMode | undefined) ?? null,
    now: Date.now(),
  });

  return {
    locale: row.locale,
    themeMode: row.theme_mode,
    updatedAt: row.updated_at,
  };
}
