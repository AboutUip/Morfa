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

/**
 * 一个 Page 内的节点共享数据域。
 * 通过 parentId 找到根节点，根节点下的整棵树视为同一个数据作用域，
 * 相互独立的 Page（不同根）不会互相读取数据。
 */
interface PageScopeIndex {
  rootIdByPageId: Map<string, string>;
}

const scopeIndexCache = new WeakMap<CanvasPage[], PageScopeIndex>();

function buildScopeIndex(pages: CanvasPage[]): PageScopeIndex {
  const pagesById = new Map(pages.map((item) => [item.id, item]));
  const rootIdByPageId = new Map<string, string>();

  for (const page of pages) {
    const visited = new Set<string>();
    let current = page;

    while (current.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = pagesById.get(current.parentId);
      if (!parent) break;
      current = parent;
    }

    rootIdByPageId.set(page.id, current.id);
  }

  return { rootIdByPageId };
}

function getScopeIndex(pages: CanvasPage[]) {
  let index = scopeIndexCache.get(pages);
  if (!index) {
    index = buildScopeIndex(pages);
    scopeIndexCache.set(pages, index);
  }
  return index;
}

export function getPageScope(
  pages: CanvasPage[],
  page: CanvasPage,
): CanvasPage[] {
  const index = getScopeIndex(pages);
  const rootId = index.rootIdByPageId.get(page.id);
  if (!rootId) return [page];

  return pages.filter(
    (item) => index.rootIdByPageId.get(item.id) === rootId,
  );
}

/**
 * 当前节点实际生效的数据：从根节点向下的继承值，再被自身同名值覆盖。
 */
export function getEffectivePageData(
  pages: CanvasPage[],
  page: CanvasPage,
): Map<string, string> {
  const pagesById = new Map(pages.map((item) => [item.id, item]));
  const chain: CanvasPage[] = [];
  const visited = new Set<string>();
  let current: CanvasPage | undefined = page;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId
      ? pagesById.get(current.parentId)
      : undefined;
  }

  const data = new Map<string, string>();
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    for (const entry of getPageData(chain[index])) {
      data.set(entry.key, entry.value);
    }
  }

  return data;
}

function resolveVariableValue(
  expression: string,
  page: CanvasPage,
  scopeById: Map<string, CanvasPage>,
  getData: (target: CanvasPage) => Map<string, string>,
): string | null {
  const separator = expression.indexOf(".");
  if (separator <= 0 || separator >= expression.length - 1) {
    return null;
  }

  const selector = expression.slice(0, separator).trim();
  const key = expression.slice(separator + 1).trim();
  if (!selector || !key) return null;

  const target = selector === "self" ? page : scopeById.get(selector);
  if (!target) return null;

  const value = getData(target).get(key);
  return value === undefined ? null : value;
}

const resolvedStyleCache = new WeakMap<
  CanvasPage[],
  Map<string, Record<string, string>>
>();

/**
 * 将样式值里的 ${self.key} / ${节点ID.key} 替换为节点数据。
 * 解析失败时保留原始表达式，方便用户发现引用错误。
 */
export function resolveStyleVariables(
  styles: Record<string, string>,
  page: CanvasPage,
  pages: CanvasPage[],
): Record<string, string> {
  const cacheable = styles === page.styles;
  let cache = resolvedStyleCache.get(pages);
  const cached = cacheable ? cache?.get(page.id) : undefined;
  if (cached) return cached;

  const scope = getPageScope(pages, page);
  const scopeById = new Map(scope.map((item) => [item.id, item]));
  const dataCache = new Map<string, Map<string, string>>();
  const getData = (target: CanvasPage) => {
    let data = dataCache.get(target.id);
    if (!data) {
      data = getEffectivePageData(pages, target);
      dataCache.set(target.id, data);
    }
    return data;
  };

  const resolved: Record<string, string> = {};
  for (const [styleKey, styleValue] of Object.entries(styles)) {
    resolved[styleKey] = styleValue.replace(
      /\$\{([^{}]+)\}/g,
      (match, rawExpression: string) => {
        const value = resolveVariableValue(
          rawExpression.trim(),
          page,
          scopeById,
          getData,
        );
        return value === null ? match : value;
      },
    );
  }

  if (cacheable) {
    if (!cache) {
      cache = new Map();
      resolvedStyleCache.set(pages, cache);
    }
    cache.set(page.id, resolved);
  }

  return resolved;
}

export function renameStyleReferences(
  styles: Record<string, string>,
  fromId: string,
  toId: string,
) {
  const escapedId = fromId.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const pattern = new RegExp(
    `\\$\\{\\s*${escapedId}\\s*\\.`,
    "g",
  );
  const replacement = `\${${toId}.`;
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(styles)) {
    next[key] = value.replace(pattern, replacement);
  }

  return next;
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

function randomPageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `n${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  }

  return `n${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function createPageId(pages: CanvasPage[] = []) {
  const used = new Set(pages.map((page) => page.id));
  let id = randomPageId();

  while (used.has(id)) {
    id = randomPageId();
  }

  return id;
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

export function getPageSize(
  page: CanvasPage,
  pages: CanvasPage[] = [],
) {
  const styles =
    pages.length > 0
      ? resolveStyleVariables(page.styles, page, pages)
      : page.styles;
  const width = Number.parseFloat(styles.width ?? "");
  const height = Number.parseFloat(styles.height ?? "");

  return {
    width: Number.isFinite(width) && width > 0 ? width : 800,
    height: Number.isFinite(height) && height > 0 ? height : 800,
  };
}
