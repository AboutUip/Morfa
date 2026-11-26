import type {
  CanvasDataEntryDto,
  CanvasDataType,
  CanvasLinkAnchorDto,
  CanvasLinkDirection,
  CanvasLinkDto,
  CanvasLinkEdge,
  CanvasPageDto,
} from "../../lib/api";

export type CanvasPage = CanvasPageDto;
export type CanvasDataEntry = CanvasDataEntryDto;
export type CanvasLink = CanvasLinkDto;
export type CanvasLinkAnchor = CanvasLinkAnchorDto;
export type {
  CanvasDataType,
  CanvasLinkAnchorDto,
  CanvasLinkDirection,
  CanvasLinkEdge,
};

export interface CanvasDocument {
  pages: CanvasPage[];
  links: CanvasLink[];
}

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

function getLocalDataMap(page: CanvasPage) {
  return new Map(
    getPageData(page).map((entry) => [entry.key, entry.value]),
  );
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

export interface LinkAccessSource {
  pageId: string;
  rank: number;
  path: string[];
}

interface IncomingLinkEdge {
  fromId: string;
  createdAt: number;
}

/**
 * 反向遍历关联图：当前节点能访问的所有上游节点。
 * rank 是路径上最晚一条关联线的创建时间；越晚优先级越高。
 */
export function getLinkAccessSources(
  links: CanvasLink[],
  page: CanvasPage,
): Map<string, LinkAccessSource> {
  const incoming = new Map<string, IncomingLinkEdge[]>();
  const addIncoming = (targetId: string, edge: IncomingLinkEdge) => {
    const list = incoming.get(targetId);
    if (list) list.push(edge);
    else incoming.set(targetId, [edge]);
  };

  for (const link of links) {
    if (link.direction === "two-way") {
      addIncoming(link.toId, {
        fromId: link.fromId,
        createdAt: link.createdAt,
      });
      addIncoming(link.fromId, {
        fromId: link.toId,
        createdAt: link.createdAt,
      });
    } else {
      addIncoming(link.toId, {
        fromId: link.fromId,
        createdAt: link.createdAt,
      });
    }
  }

  const best = new Map<string, LinkAccessSource>();
  const queue: LinkAccessSource[] = [
    { pageId: page.id, rank: Number.NEGATIVE_INFINITY, path: [page.id] },
  ];

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;

    for (const edge of incoming.get(current.pageId) ?? []) {
      // 以来源节点自己的关联创建时间排序，而不是整条路径的最后时间。
      // 这样 A -> B -> C 中，B 比 A 更晚关联时 B 优先。
      const rank = edge.createdAt;
      const next: LinkAccessSource = {
        pageId: edge.fromId,
        rank,
        path: [edge.fromId, ...current.path],
      };
      const existing = best.get(edge.fromId);
      if (existing && existing.rank >= rank) continue;

      best.set(edge.fromId, next);
      queue.push(next);
    }
  }

  best.delete(page.id);
  return best;
}

function getLinkAccessibleIds(
  pages: CanvasPage[],
  links: CanvasLink[],
  page: CanvasPage,
) {
  const accessible = new Set(getPageScope(pages, page).map((item) => item.id));
  for (const sourceId of getLinkAccessSources(links, page).keys()) {
    accessible.add(sourceId);
  }
  accessible.add(page.id);
  return accessible;
}

function getParentChain(pages: CanvasPage[], page: CanvasPage) {
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

  return chain;
}

/**
 * 当前节点实际生效的数据：本地数据最高，其次是 parentId 继承，
 * 最后是关联线继承；关联线之间按路径上最晚的连接时间覆盖。
 */
export function getEffectivePageData(
  pages: CanvasPage[],
  links: CanvasLink[],
  page: CanvasPage,
): Map<string, string> {
  const data = new Map<string, string>();
  const accessSources = [...getLinkAccessSources(links, page).values()].sort(
    (a, b) => a.rank - b.rank,
  );

  for (const source of accessSources) {
    const target = pages.find((item) => item.id === source.pageId);
    if (!target) continue;
    for (const entry of getPageData(target)) {
      data.set(entry.key, entry.value);
    }
  }

  const chain = getParentChain(pages, page);
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    for (const entry of getPageData(chain[index])) {
      data.set(entry.key, entry.value);
    }
  }

  return data;
}

export function getInheritedPageData(
  pages: CanvasPage[],
  links: CanvasLink[],
  page: CanvasPage,
): InheritedCanvasDataEntry[] {
  const pagesById = new Map(pages.map((item) => [item.id, item]));
  const higherKeys = new Set(getPageData(page).map((entry) => entry.key));
  const result: InheritedCanvasDataEntry[] = [];
  const visited = new Set<string>([page.id]);
  let parentId = page.parentId;

  while (parentId) {
    const parent = pagesById.get(parentId);
    if (!parent || visited.has(parent.id)) break;

    visited.add(parent.id);
    for (const entry of getPageData(parent)) {
      result.push({
        ...entry,
        sourceId: parent.id,
        sourceName: parent.name,
        shadowed: higherKeys.has(entry.key),
      });
      higherKeys.add(entry.key);
    }

    parentId = parent.parentId;
  }

  const linkSources = [...getLinkAccessSources(links, page).values()].sort(
    (a, b) => b.rank - a.rank,
  );
  for (const source of linkSources) {
    const target = pagesById.get(source.pageId);
    if (!target) continue;
    for (const entry of getPageData(target)) {
      result.push({
        ...entry,
        sourceId: target.id,
        sourceName: target.name,
        shadowed: higherKeys.has(entry.key),
      });
      higherKeys.add(entry.key);
    }
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

export type CanvasLintCode =
  | "malformed"
  | "missing-node"
  | "no-access"
  | "missing-self-key"
  | "missing-node-key";

export interface CanvasLintItem {
  id: string;
  severity: "error";
  pageId: string;
  pageName: string;
  styleKey: string;
  expression: string;
  code: CanvasLintCode;
  targetId?: string;
  targetName?: string;
  key?: string;
  chain?: string[];
}

function parseVariableExpression(expression: string) {
  const separator = expression.indexOf(".");
  if (separator <= 0 || separator >= expression.length - 1) {
    return null;
  }

  const selector = expression.slice(0, separator).trim();
  const key = expression.slice(separator + 1).trim();
  if (!selector || !key) return null;
  return { selector, key };
}

export function collectCanvasLint(
  pages: CanvasPage[],
  links: CanvasLink[],
): CanvasLintItem[] {
  const result: CanvasLintItem[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    const effectiveData = getEffectivePageData(pages, links, page);
    const accessible = getLinkAccessibleIds(pages, links, page);
    const linkAccess = getLinkAccessSources(links, page);

    for (const [styleKey, styleValue] of Object.entries(page.styles)) {
      let index = 0;
      for (const match of styleValue.matchAll(/\$\{([^{}]+)\}/g)) {
        index += 1;
        const expression = `\${${match[1].trim()}}`;
        const parsed = parseVariableExpression(match[1].trim());
        const id = `${page.id}:${styleKey}:${index}:${expression}`;
        if (seen.has(id)) continue;
        seen.add(id);

        if (!parsed) {
          result.push({
            id,
            severity: "error",
            pageId: page.id,
            pageName: page.name,
            styleKey,
            expression,
            code: "malformed",
          });
          continue;
        }

        if (parsed.selector === "self") {
          if (!effectiveData.has(parsed.key)) {
            result.push({
              id,
              severity: "error",
              pageId: page.id,
              pageName: page.name,
              styleKey,
              expression,
              code: "missing-self-key",
              key: parsed.key,
            });
          }
          continue;
        }

        const target = pages.find(
          (item) => item.id === parsed.selector,
        );
        if (!target) {
          result.push({
            id,
            severity: "error",
            pageId: page.id,
            pageName: page.name,
            styleKey,
            expression,
            code: "missing-node",
            targetId: parsed.selector,
            key: parsed.key,
          });
          continue;
        }

        if (!accessible.has(target.id)) {
          result.push({
            id,
            severity: "error",
            pageId: page.id,
            pageName: page.name,
            styleKey,
            expression,
            code: "no-access",
            targetId: target.id,
            targetName: target.name,
            key: parsed.key,
            chain: [target.name, page.name],
          });
          continue;
        }

        if (!getLocalDataMap(target).has(parsed.key)) {
          result.push({
            id,
            severity: "error",
            pageId: page.id,
            pageName: page.name,
            styleKey,
            expression,
            code: "missing-node-key",
            targetId: target.id,
            targetName: target.name,
            key: parsed.key,
            chain:
              linkAccess.get(target.id)?.path.map((pageId) => {
                return (
                  pages.find((item) => item.id === pageId)?.name ??
                  pageId
                );
              }) ?? [target.name, page.name],
          });
        }
      }
    }
  }

  return result;
}

const FALLBACK_CACHE_LIMIT = 20_000;
const styleFallbackCache = new Map<string, string>();

export function clearStyleVariableFallbackCache() {
  styleFallbackCache.clear();
}

interface ResolveVariableResult {
  value: string | null;
  failed: boolean;
}

function resolveVariableValue(
  expression: string,
  pages: CanvasPage[],
  access: Set<string>,
  effectiveData: Map<string, string>,
): ResolveVariableResult {
  const parsed = parseVariableExpression(expression);
  if (!parsed) return { value: null, failed: true };

  if (parsed.selector === "self") {
    const value = effectiveData.get(parsed.key);
    return value === undefined
      ? { value: null, failed: true }
      : { value, failed: false };
  }

  const target = pages.find((item) => item.id === parsed.selector);
  if (!target || !access.has(target.id)) {
    return { value: null, failed: true };
  }

  const value = getLocalDataMap(target).get(parsed.key);
  return value === undefined
    ? { value: null, failed: true }
    : { value, failed: false };
}

let styleCachePages: CanvasPage[] | null = null;
let styleCacheLinks: CanvasLink[] | null = null;
let styleCache = new Map<string, Record<string, string>>();

/**
 * 将样式值里的 ${self.key} / ${节点ID.key} 替换为节点数据。
 * 显式节点引用只读该节点的本地数据；self 使用继承后的有效数据。
 * 访问失败时使用上一次成功解析的视觉效果，并保留原始表达式供 lint 使用。
 */
export function resolveStyleVariables(
  styles: Record<string, string>,
  page: CanvasPage,
  pages: CanvasPage[],
  links: CanvasLink[] = [],
): Record<string, string> {
  const cacheable = styles === page.styles;
  if (styleCachePages !== pages || styleCacheLinks !== links) {
    styleCachePages = pages;
    styleCacheLinks = links;
    styleCache = new Map();
  }

  const cached = cacheable ? styleCache.get(page.id) : undefined;
  if (cached) return cached;

  const access = getLinkAccessibleIds(pages, links, page);
  const effectiveData = getEffectivePageData(pages, links, page);

  const resolved: Record<string, string> = {};
  for (const [styleKey, styleValue] of Object.entries(styles)) {
    let failed = false;
    const next = styleValue.replace(
      /\$\{([^{}]+)\}/g,
      (match, rawExpression: string) => {
        const result = resolveVariableValue(
          rawExpression.trim(),
          pages,
          access,
          effectiveData,
        );
        if (result.failed) {
          failed = true;
          return match;
        }
        return result.value ?? match;
      },
    );

    const fallbackKey = `${page.id}\u0000${styleKey}\u0000${styleValue}`;
    if (failed) {
      resolved[styleKey] =
        styleFallbackCache.get(fallbackKey) ?? next;
    } else {
      resolved[styleKey] = next;
      if (styleFallbackCache.size >= FALLBACK_CACHE_LIMIT) {
        const first = styleFallbackCache.keys().next();
        if (!first.done) styleFallbackCache.delete(first.value);
      }
      styleFallbackCache.set(fallbackKey, next);
    }
  }

  if (cacheable) {
    styleCache.set(page.id, resolved);
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

export function renameLinkReferences(
  links: CanvasLink[],
  fromId: string,
  toId: string,
) {
  return links.map((link) => ({
    ...link,
    fromId: link.fromId === fromId ? toId : link.fromId,
    toId: link.toId === fromId ? toId : link.toId,
  }));
}

export function getLinkAnchorPoint(
  page: CanvasPage,
  anchor: CanvasLinkAnchor,
  pages: CanvasPage[],
  links: CanvasLink[],
): { x: number; y: number } {
  const { width, height } = getPageSize(page, pages, links);
  return {
    x: page.x + anchor.x * width,
    y: page.y + anchor.y * height,
  };
}

/**
 * 把世界坐标投影到节点最近的边，并归一化为相对节点的锚点。
 */
export function projectPointToPageEdge(
  page: CanvasPage,
  worldX: number,
  worldY: number,
  pages: CanvasPage[],
  links: CanvasLink[] = [],
): CanvasLinkAnchor {
  const { width, height } = getPageSize(page, pages, links);
  const clampedX = Math.min(
    page.x + width,
    Math.max(page.x, worldX),
  );
  const clampedY = Math.min(
    page.y + height,
    Math.max(page.y, worldY),
  );
  const left = clampedX - page.x;
  const right = page.x + width - clampedX;
  const top = clampedY - page.y;
  const bottom = page.y + height - clampedY;
  const min = Math.min(left, right, top, bottom);

  if (min === left) {
    return {
      x: 0,
      y: (clampedY - page.y) / height,
      edge: "left",
    };
  }
  if (min === right) {
    return {
      x: 1,
      y: (clampedY - page.y) / height,
      edge: "right",
    };
  }
  if (min === top) {
    return {
      x: (clampedX - page.x) / width,
      y: 0,
      edge: "top",
    };
  }
  return {
    x: (clampedX - page.x) / width,
    y: 1,
    edge: "bottom",
  };
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

export function createLinkId(links: CanvasLink[] = []) {
  const used = new Set(links.map((link) => link.id));
  let id = `l${randomPageId().slice(1)}`;

  while (used.has(id)) {
    id = `l${randomPageId().slice(1)}`;
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
  links: CanvasLink[] = [],
) {
  const styles =
    pages.length > 0
      ? resolveStyleVariables(page.styles, page, pages, links)
      : page.styles;
  const width = Number.parseFloat(styles.width ?? "");
  const height = Number.parseFloat(styles.height ?? "");

  return {
    width: Number.isFinite(width) && width > 0 ? width : 800,
    height: Number.isFinite(height) && height > 0 ? height : 800,
  };
}
