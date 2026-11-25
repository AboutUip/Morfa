import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(currentDir, "..");
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(SERVER_ROOT, "data");
export const DATABASE_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(DATA_DIR, "morfa.sqlite");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const AVATARS_DIR = path.join(UPLOADS_DIR, "avatars");
export const MIGRATIONS_DIR = path.join(SERVER_ROOT, "migrations");

export const HOST = process.env.HOST ?? "127.0.0.1";
export const PORT = Number(process.env.PORT ?? 3001);

export const SESSION_COOKIE = "morfa_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const isProduction = process.env.NODE_ENV === "production";
