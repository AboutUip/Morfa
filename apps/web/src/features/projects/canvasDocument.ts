import type {
  CanvasDataEntryDto,
  CanvasDataType,
  CanvasPageDto,
} from "../../lib/api";

export type CanvasPage = CanvasPageDto;
export type CanvasDataEntry = CanvasDataEntryDto;
export type { CanvasDataType } from "../../lib/api";

export const CANVAS_DATA_TYPES: readonly CanvasDataType[] = [
  "text",
  "number",
  "color",
  "date",
  "boolean",
];

export function getPageData(page: CanvasPage): CanvasDataEntry[] {
  return page.data ?? [];
}

export interface InheritedCanvasDataEntry extends CanvasDataEntry {
  sourceId: string;
  sourceName: string;
  shadowed: boolean;
}

/**
 * 由近到远读取父级数据，同名键只保留最近的一层。
 * 当前节点已有的键仍然展示，但标记为已覆盖，实际以当前节点为准。
 */
export function getInheritedPageData(
  pages: CanvasPage[],
  page: CanvasPage,
): InheritedCanvasDataEntry[] {
  const pagesById = new Map(pages.map((item) => [item.id, item]));
  const localKeys = new Set(getPageData(page).map((entry) => entry.key));
  const visited = new Set<string>([page.id]);
  const seenKeys = new Set<string>();
  const result: InheritedCanvasDataEntry[] = [];
  let parentId = page.parentId;

  while (parentId) {
    const parent = pagesById.get(parentId);
    if (!parent || visited.has(parent.id)) break;

    visited.add(parent.id);
    for (const entry of getPageData(parent)) {
      if (seenKeys.has(entry.key)) continue;
      seenKeys.add(entry.key);
      result.push({
        ...entry,
        sourceId: parent.id,
        sourceName: parent.name,
        shadowed: localKeys.has(entry.key),
      });
    }

    parentId = parent.parentId;
  }

  return result;
}

export function createDefaultDataValue(type: CanvasDataType): string {
  if (type === "color") return "#ffffff";
  if (type === "boolean") return "false";
  if (type === "date") {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
}

export const SEE_THROUGH_STYLE_KEY = "--morfa-see-through";

export const DEFAULT_PAGE_STYLES: Record<string, string> = {
  width: "800px",
  height: "800px",
  "background-color": "#ffffff",
};

export function isPageSeeThrough(page: CanvasPage) {
  return page.styles[SEE_THROUGH_STYLE_KEY] === "1";
}

export function withPageSeeThrough(
  styles: Record<string, string>,
  enabled: boolean,
) {
  const next = { ...styles };
  if (enabled) next[SEE_THROUGH_STYLE_KEY] = "1";
  else delete next[SEE_THROUGH_STYLE_KEY];
  return next;
}

export function createPageStyles(): Record<string, string> {
  return { ...DEFAULT_PAGE_STYLES };
}

export function createPageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `page-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function uniquePageName(baseName: string, pages: CanvasPage[]) {
  if (!pages.some((page) => page.name === baseName)) {
    return baseName;
  }

  let index = 2;
  while (pages.some((page) => page.name === `${baseName} ${index}`)) {
    index += 1;
  }

  return `${baseName} ${index}`;
}

export function getPageSize(page: CanvasPage) {
  const width = Number.parseFloat(page.styles.width ?? "");
  const height = Number.parseFloat(page.styles.height ?? "");

  return {
    width: Number.isFinite(width) && width > 0 ? width : 800,
    height: Number.isFinite(height) && height > 0 ? height : 800,
  };
}
