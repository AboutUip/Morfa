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
const MAX_CANVAS_LINKS = 500;
const MAX_LINK_ID_LENGTH = 120;
const MAX_LINK_COLOR_LENGTH = 64;
const MAX_LINK_WIDTH = 32;
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

export type CanvasLinkDirection = "one-way" | "two-way";
export type CanvasLinkEdge = "top" | "right" | "bottom" | "left";

export interface CanvasLinkAnchorDto {
  x: number;
  y: number;
  edge: CanvasLinkEdge;
}

export interface CanvasLinkDto {
  id: string;
  fromId: string;
  toId: string;
  direction: CanvasLinkDirection;
  color: string;
  width: number;
  dashed: boolean;
  fromAnchor: CanvasLinkAnchorDto;
  toAnchor: CanvasLinkAnchorDto;
  createdAt: number;
}

export interface CanvasDocumentDto {
  pages: CanvasPageDto[];
  links: CanvasLinkDto[];
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

function normalizeAnchor(value: unknown): CanvasLinkAnchorDto {
  const anchor = readObject(value);
  const x = readCoordinate(anchor.x);
  const y = readCoordinate(anchor.y);
  if (x < 0 || x > 1 || y < 0 || y > 1) invalidDocument();

  const edge = anchor.edge;
  if (
    edge !== "top" &&
    edge !== "right" &&
    edge !== "bottom" &&
    edge !== "left"
  ) {
    invalidDocument();
  }

  return { x, y, edge };
}

function normalizeLinks(
  value: unknown,
  pages: CanvasPageDto[],
): CanvasLinkDto[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidDocument();
  if (value.length > MAX_CANVAS_LINKS) {
    throw new ApiError(
      413,
      "CANVAS_DOCUMENT_TOO_LARGE",
      "关联线数量超出限制",
    );
  }

  const pageIds = new Set(pages.map((page) => page.id));
  const linkIds = new Set<string>();
  const links: CanvasLinkDto[] = [];

  for (const rawLink of value) {
    const link = readObject(rawLink);
    const id = readString(link.id, MAX_LINK_ID_LENGTH, true);
    if (linkIds.has(id)) invalidDocument();
    linkIds.add(id);

    const fromId = readPageId(link.fromId);
    const toId = readPageId(link.toId);
    if (fromId === toId) invalidDocument();
    if (!pageIds.has(fromId) || !pageIds.has(toId)) {
      invalidDocument();
    }

    const direction = link.direction;
    if (direction !== "one-way" && direction !== "two-way") {
      invalidDocument();
    }

    const color = readString(link.color, MAX_LINK_COLOR_LENGTH, true);
    const widthValue =
      typeof link.width === "number" && Number.isFinite(link.width)
        ? link.width
        : 2;
    if (widthValue < 1 || widthValue > MAX_LINK_WIDTH) {
      invalidDocument();
    }
    const dashed = Boolean(link.dashed);
    const createdAt =
      typeof link.createdAt === "number" &&
      Number.isFinite(link.createdAt)
        ? link.createdAt
        : 0;

    links.push({
      id,
      fromId,
      toId,
      direction,
      color,
      width: widthValue,
      dashed,
      fromAnchor: normalizeAnchor(link.fromAnchor),
      toAnchor: normalizeAnchor(link.toAnchor),
      createdAt,
    });
  }

  return links;
}

function parseStoredDocument(data: string): {
  pages: CanvasPageDto[];
  links: CanvasLinkDto[];
} {
  if (!data) return { pages: [], links: [] };

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { pages: [], links: [] };
    }
    const pages = (parsed as { pages?: unknown }).pages;
    if (!Array.isArray(pages)) return { pages: [], links: [] };
    const normalizedPages = normalizePages(pages);
    const links = normalizeLinks(
      (parsed as { links?: unknown }).links,
      normalizedPages,
    );
    return { pages: normalizedPages, links };
  } catch {
    return { pages: [], links: [] };
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

  const document = parseStoredDocument(row.data);
  return {
    pages: document.pages,
    links: document.links,
    updatedAt: row.updated_at,
  };
}

export function saveProjectCanvas(
  userId: string,
  projectId: string,
  rawPages: unknown,
  rawLinks: unknown,
): CanvasDocumentDto {
  const row = findProjectDataForUser(userId, projectId);
  if (!row) {
    throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
  }

  const pages = normalizePages(rawPages);
  const links = normalizeLinks(rawLinks, pages);
  const data = JSON.stringify({ version: 2, pages, links });
  if (data.length > MAX_CANVAS_JSON_LENGTH) {
    throw new ApiError(
      413,
      "CANVAS_DOCUMENT_TOO_LARGE",
      "画布数据超出限制",
    );
  }

  const updatedAt = Date.now();
  updateProjectData(projectId, data, updatedAt);

  return { pages, links, updatedAt };
}
