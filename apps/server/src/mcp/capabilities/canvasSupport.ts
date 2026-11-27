import type { CanvasResolvedFrame } from "@morfa/shared/canvas-layout";

import { ApiError } from "../../lib/errors.js";
import {
  getProjectCanvas,
  type CanvasDocumentDto,
  type CanvasPageDto,
} from "../../services/canvasDocuments.js";
import { resolvePageFrames } from "../../services/canvasFrames.js";

export const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const MAX_PAGE_ID_LENGTH = 120;

export const PROJECT_ID_SCHEMA = {
  type: "string" as const,
  description: "Morfa project id.",
  minLength: 1,
  maxLength: 120,
};

export const PAGE_ID_SCHEMA = {
  type: "string" as const,
  description:
    "Page id (letters, digits, underscore, hyphen; max 120 chars).",
  minLength: 1,
  maxLength: MAX_PAGE_ID_LENGTH,
};

export const EXPECTED_UPDATED_AT_SCHEMA = {
  type: "number" as const,
  description:
    "Optional optimistic concurrency check. Must equal the current canvas updatedAt, otherwise the call fails with 409.",
  minimum: 0,
};

export function invalidArgument(field: string, message: string): never {
  throw new ApiError(
    400,
    "MCP_INVALID_ARGUMENTS",
    `参数 ${field} ${message}`,
  );
}

export function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseJsonArgument(value: unknown, field: string): unknown {
  if (typeof value !== "string") {
    invalidArgument(field, "必须是 JSON 字符串");
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    invalidArgument(field, "必须是合法的 JSON 字符串");
  }
}

export function readPageIdArgument(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
    invalidArgument(field, "必须是字符串");
  }
  const id = value.trim();
  if (
    !id ||
    id.length > MAX_PAGE_ID_LENGTH ||
    !PAGE_ID_PATTERN.test(id) ||
    id.toLowerCase() === "self"
  ) {
    throw new ApiError(
      400,
      "CANVAS_PAGE_ID_INVALID",
      `参数 ${field} 不是合法的页面 id`,
    );
  }
  return id;
}

export function readExpectedUpdatedAt(
  args: Record<string, unknown>,
): number | undefined {
  return typeof args.expectedUpdatedAt === "number"
    ? args.expectedUpdatedAt
    : undefined;
}

export function loadCanvasForWrite(
  userId: string,
  projectId: string,
  expectedUpdatedAt: number | undefined,
): CanvasDocumentDto {
  const document = getProjectCanvas(userId, projectId);
  if (
    expectedUpdatedAt !== undefined &&
    document.updatedAt !== expectedUpdatedAt
  ) {
    throw new ApiError(
      409,
      "CANVAS_REVISION_CONFLICT",
      `画布已更新（当前 updatedAt=${document.updatedAt}），请重新读取后再修改`,
    );
  }
  return document;
}

export function findPage(
  document: CanvasDocumentDto,
  pageId: string,
): CanvasPageDto {
  const page = document.pages.find((item) => item.id === pageId);
  if (!page) {
    throw new ApiError(
      404,
      "CANVAS_PAGE_NOT_FOUND",
      `页面 ${pageId} 不存在`,
    );
  }
  return page;
}

export function assertParentAssignable(
  pageId: string,
  parentId: string,
  pages: CanvasPageDto[],
) {
  const parent = pages.find((item) => item.id === parentId);
  if (!parent) {
    throw new ApiError(
      404,
      "CANVAS_PAGE_PARENT_NOT_FOUND",
      `父页面 ${parentId} 不存在`,
    );
  }
  if (parent.id === pageId) {
    throw new ApiError(
      400,
      "CANVAS_PAGE_PARENT_INVALID",
      "页面不能把自己设为父页面",
    );
  }

  const visited = new Set<string>();
  let cursor: CanvasPageDto | undefined = parent;
  while (cursor?.parentId) {
    if (cursor.parentId === pageId) {
      throw new ApiError(
        400,
        "CANVAS_PAGE_PARENT_CYCLE",
        "父页面设置会形成循环",
      );
    }
    if (visited.has(cursor.parentId)) break;
    visited.add(cursor.parentId);
    cursor = pages.find((item) => item.id === cursor?.parentId);
  }
}

export function frameForPage(
  document: CanvasDocumentDto,
  pageId: string,
): CanvasResolvedFrame | null {
  return (
    resolvePageFrames(document.pages, document.links).get(pageId) ?? null
  );
}

/**
 * Normalize a CSS length coming from a JSON layout patch / resize argument.
 * Numbers and bare numeric strings become px so the stored styles stay valid
 * CSS; other strings are passed through to the layout resolver.
 */
export function readCssLength(value: unknown, field: string): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invalidArgument(field, "必须是有限的数字");
    }
    return `${value}px`;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) invalidArgument(field, "不能为空");
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
      return `${text}px`;
    }
    return text;
  }
  invalidArgument(field, "必须是数字或 CSS 长度字符串");
}

export function pageSize(frame: CanvasResolvedFrame | null) {
  return frame
    ? { width: frame.width, height: frame.height }
    : { width: 800, height: 800 };
}

export function hasPositionAnchors(
  styles: Record<string, string>,
): boolean {
  return (
    "left" in styles ||
    "right" in styles ||
    "top" in styles ||
    "bottom" in styles
  );
}

export function clearPositionAnchors(styles: Record<string, string>) {
  delete styles.left;
  delete styles.right;
  delete styles.top;
  delete styles.bottom;
}
