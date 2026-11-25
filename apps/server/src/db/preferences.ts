import { db } from "./connection.js";

export type UserLocale = "zh-CN" | "en-US";
export type UserThemeMode = "system" | "light" | "dark";

export interface UserPreferencesRow {
  user_id: string;
  locale: UserLocale | null;
  theme_mode: UserThemeMode | null;
  updated_at: number;
}

export interface PreferencesDto {
  locale: UserLocale | null;
  themeMode: UserThemeMode | null;
  updatedAt: number | null;
}

export function findPreferences(userId: string): UserPreferencesRow | undefined {
  return db
    .prepare("SELECT * FROM user_preferences WHERE user_id = ?")
    .get(userId) as unknown as UserPreferencesRow | undefined;
}

export function upsertPreferences(input: {
  userId: string;
  locale: UserLocale | null;
  themeMode: UserThemeMode | null;
  now: number;
}): UserPreferencesRow {
  db.prepare(
    `INSERT INTO user_preferences (user_id, locale, theme_mode, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       locale = COALESCE(excluded.locale, user_preferences.locale),
       theme_mode = COALESCE(excluded.theme_mode, user_preferences.theme_mode),
       updated_at = excluded.updated_at`,
  ).run(input.userId, input.locale, input.themeMode, input.now);

  const row = findPreferences(input.userId);
  if (!row) throw new Error("failed to persist user preferences");
  return row;
}
