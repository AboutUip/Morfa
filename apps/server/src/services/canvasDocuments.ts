import {
  findProjectDataForUser,
  updateProjectData,
} from "../db/projects.js";
import { ApiError } from "../lib/errors.js";

const MAX_CANVAS_PAGES = 200;
const MAX_PAGE_STYLES = 120;
const MAX_PAGE_ID_LENGTH = 120;
const MAX_PAGE_NAME_LENGTH = 160;
const MAX_STYLE_KEY_LENGTH = 100;
const MAX_STYLE_VALUE_LENGTH = 2000;
const MAX_PAGE_DATA_ENTRIES = 100;
const MAX_DATA_KEY_LENGTH = 64;
const MAX_DATA_VALUE_LENGTH = 2000;
const MAX_DATA_COMMIT_LENGTH = 1000;
const MAX_CANVAS_JSON_LENGTH = 2_000_000;

export type CanvasFrame = "iphone" | "android" | "watch";
export type CanvasDataType =
  | "text"
  | "number"
  | "color"
  | "date"
  | "boolean";

export interface CanvasDataEntryDto {
  key: string;
  type: CanvasDataType;
  value: string;
  commit?: string;
}

export interface CanvasPageDto {
  id: string;
  name: string;
  x: number;
  y: number;
  styles: Record<string, string>;
  frame?: CanvasFrame;
  lockedSize?: boolean;
  parentId?: string;
  data?: CanvasDataEntryDto[];
}

export interface CanvasDocumentDto {
  pages: CanvasPageDto[];
  updatedAt: number;
}

function invalidDocument(): never {
  throw new ApiError(
    400,
    "CANVAS_DOCUMENT_INVALID",
    "画布数据格式不正确",
  );
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidDocument();
  }
  return value as Record<string, unknown>;
}

function readString(
  value: unknown,
  maxLength: number,
  required = false,
): string {
  if (typeof value !== "string") invalidDocument();
  const text = value.trim();
  if (required && !text) invalidDocument();
  if (text.length > maxLength) invalidDocument();
  return text;
}

function readCoordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalidDocument();
  }
  return value;
}

function normalizeStyles(value: unknown): Record<string, string> {
  const styles = readObject(value);
  const entries = Object.entries(styles);
  if (entries.length > MAX_PAGE_STYLES) invalidDocument();

  const normalized: Record<string, string> = {};
  for (const [key, styleValue] of entries) {
    if (typeof key !== "string" || typeof styleValue !== "string") {
      invalidDocument();
    }
    const name = key.trim();
    if (!name || name.length > MAX_STYLE_KEY_LENGTH) invalidDocument();
    if (styleValue.length > MAX_STYLE_VALUE_LENGTH) invalidDocument();
    normalized[name] = styleValue;
  }

  return normalized;
}

function readPageId(value: unknown) {
  const id = readString(value, MAX_PAGE_ID_LENGTH, true);
  if (
    !/^[A-Za-z0-9_-]+$/.test(id) ||
    id.toLowerCase() === "self"
  ) {
    invalidDocument();
  }
  return id;
}

function normalizeData(value: unknown): CanvasDataEntryDto[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidDocument();
  if (value.length > MAX_PAGE_DATA_ENTRIES) invalidDocument();

  const entries: CanvasDataEntryDto[] = [];
  const keys = new Set<string>();

  for (const rawEntry of value) {
    const entry = readObject(rawEntry);
    const key = readString(entry.key, MAX_DATA_KEY_LENGTH, true);
    if (keys.has(key)) invalidDocument();
    keys.add(key);

    const type = entry.type;
    if (
      type !== "text" &&
      type !== "number" &&
      type !== "color" &&
      type !== "date" &&
      type !== "boolean"
    ) {
      invalidDocument();
    }

    const entryValue = typeof entry.value === "string" ? entry.value : "";
    if (entryValue.length > MAX_DATA_VALUE_LENGTH) invalidDocument();

    const commit =
      typeof entry.commit === "string" ? entry.commit.trim() : "";
    if (commit.length > MAX_DATA_COMMIT_LENGTH) invalidDocument();

    entries.push({
      key,
      type,
      value: entryValue,
      ...(commit ? { commit } : {}),
    });
  }

  return entries;
}

function normalizePage(value: unknown): CanvasPageDto {
  const page = readObject(value);
  const frame =
    page.frame === "iphone" ||
    page.frame === "android" ||
    page.frame === "watch"
      ? page.frame
      : undefined;
  const lockedSize =
    typeof page.lockedSize === "boolean" ? page.lockedSize : undefined;
  const parentIdValue =
    typeof page.parentId === "string" ? page.parentId.trim() : "";
  const parentId = parentIdValue
    ? readPageId(parentIdValue)
    : undefined;
  const id = readPageId(page.id);
  if (parentId === id) invalidDocument();
  const data = normalizeData(page.data);

  return {
    id,
    name: readString(page.name, MAX_PAGE_NAME_LENGTH) || "Page",
    x: readCoordinate(page.x),
    y: readCoordinate(page.y),
    styles: normalizeStyles(page.styles),
    ...(frame ? { frame } : {}),
    ...(lockedSize !== undefined ? { lockedSize } : {}),
    ...(parentId ? { parentId } : {}),
    ...(data.length ? { data } : {}),
  };
}

function normalizePages(value: unknown): CanvasPageDto[] {
  if (!Array.isArray(value)) invalidDocument();
  if (value.length > MAX_CANVAS_PAGES) {
    throw new ApiError(
      413,
      "CANVAS_DOCUMENT_TOO_LARGE",
      "页面数量超出限制",
    );
  }

  const pages = value.map(normalizePage);
  if (new Set(pages.map((page) => page.id)).size !== pages.length) {
    invalidDocument();
  }
  return pages;
}

function parseStoredDocument(data: string): CanvasPageDto[] {
  if (!data) return [];

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const pages = (parsed as { pages?: unknown }).pages;
    if (!Array.isArray(pages)) return [];
    return normalizePages(pages);
  } catch {
    return [];
  }
}

export function getProjectCanvas(
  userId: string,
  projectId: string,
): CanvasDocumentDto {
  const row = findProjectDataForUser(userId, projectId);
  if (!row) {
    throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
  }

  return {
    pages: parseStoredDocument(row.data),
    updatedAt: row.updated_at,
  };
}

export function saveProjectCanvas(
  userId: string,
  projectId: string,
  rawPages: unknown,
): CanvasDocumentDto {
  const row = findProjectDataForUser(userId, projectId);
  if (!row) {
    throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
  }

  const pages = normalizePages(rawPages);
  const data = JSON.stringify({ version: 1, pages });
  if (data.length > MAX_CANVAS_JSON_LENGTH) {
    throw new ApiError(
      413,
      "CANVAS_DOCUMENT_TOO_LARGE",
      "画布数据超出限制",
    );
  }

  const updatedAt = Date.now();
  updateProjectData(projectId, data, updatedAt);

  return { pages, updatedAt };
}
