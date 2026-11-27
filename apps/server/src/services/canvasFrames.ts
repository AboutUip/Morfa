import {
  resolveCanvasLayout,
  type CanvasLayoutIssue,
  type CanvasLayoutNode,
  type CanvasResolvedFrame,
} from "@morfa/shared/canvas-layout";

import type {
  CanvasLinkDto,
  CanvasPageDto,
} from "./canvasDocuments.js";

function localDataMap(page: CanvasPageDto) {
  return new Map(
    (page.data ?? []).map((entry) => [entry.key, entry.value]),
  );
}

function scopeRootId(
  page: CanvasPageDto,
  pagesById: Map<string, CanvasPageDto>,
) {
  const visited = new Set<string>();
  let current = page;
  while (current.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = pagesById.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

function getLinkAccessSources(
  links: CanvasLinkDto[],
  page: CanvasPageDto,
) {
  const incoming = new Map<
    string,
    { fromId: string; createdAt: number }[]
  >();
  const addIncoming = (targetId: string, fromId: string, createdAt: number) => {
    const list = incoming.get(targetId);
    if (list) list.push({ fromId, createdAt });
    else incoming.set(targetId, [{ fromId, createdAt }]);
  };
  for (const link of links) {
    addIncoming(link.toId, link.fromId, link.createdAt);
    if (link.direction === "two-way") {
      addIncoming(link.fromId, link.toId, link.createdAt);
    }
  }

  const best = new Map<string, { pageId: string; rank: number }>();
  const queue = [
    { pageId: page.id, rank: Number.NEGATIVE_INFINITY },
  ];
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    for (const edge of incoming.get(current.pageId) ?? []) {
      const existing = best.get(edge.fromId);
      if (existing && existing.rank >= edge.createdAt) continue;
      best.set(edge.fromId, {
        pageId: edge.fromId,
        rank: edge.createdAt,
      });
      queue.push({ pageId: edge.fromId, rank: edge.createdAt });
    }
  }
  best.delete(page.id);
  return best;
}

function getEffectiveData(
  pages: CanvasPageDto[],
  links: CanvasLinkDto[],
  page: CanvasPageDto,
) {
  const data = new Map<string, string>();
  const linkSources = [...getLinkAccessSources(links, page).values()].sort(
    (a, b) => a.rank - b.rank,
  );
  const pagesById = new Map(pages.map((item) => [item.id, item]));
  for (const source of linkSources) {
    const target = pagesById.get(source.pageId);
    if (!target) continue;
    for (const [key, value] of localDataMap(target)) data.set(key, value);
  }

  const chain: CanvasPageDto[] = [];
  const visited = new Set<string>();
  let current: CanvasPageDto | undefined = page;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId
      ? pagesById.get(current.parentId)
      : undefined;
  }
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    for (const [key, value] of localDataMap(chain[index])) {
      data.set(key, value);
    }
  }
  return data;
}

function getAccessibleIds(
  pages: CanvasPageDto[],
  links: CanvasLinkDto[],
  page: CanvasPageDto,
) {
  const pagesById = new Map(pages.map((item) => [item.id, item]));
  const rootId = scopeRootId(page, pagesById);
  const accessible = new Set(
    pages
      .filter((item) => scopeRootId(item, pagesById) === rootId)
      .map((item) => item.id),
  );
  for (const sourceId of getLinkAccessSources(links, page).keys()) {
    accessible.add(sourceId);
  }
  accessible.add(page.id);
  return accessible;
}

function resolveVariable(
  expression: string,
  page: CanvasPageDto,
  pages: CanvasPageDto[],
  links: CanvasLinkDto[],
) {
  const separator = expression.indexOf(".");
  if (separator <= 0 || separator >= expression.length - 1) {
    return null;
  }
  const selector = expression.slice(0, separator).trim();
  const key = expression.slice(separator + 1).trim();
  if (!selector || !key) return null;

  if (selector === "self") {
    return getEffectiveData(pages, links, page).get(key) ?? null;
  }
  const accessible = getAccessibleIds(pages, links, page);
  const target = pages.find((item) => item.id === selector);
  if (!target || !accessible.has(target.id)) return null;
  return localDataMap(target).get(key) ?? null;
}

/**
 * Resolve `${self.key}` / `${nodeId.key}` style variables on the server.
 * The web app has the same semantics; keeping them here prevents screenshots
 * and MCP layout from falling back to default sizes for data-bound styles.
 */
export function resolvePageStyles(
  page: CanvasPageDto,
  pages: CanvasPageDto[],
  links: CanvasLinkDto[],
): Record<string, string> {
  if (!Object.values(page.styles).some((value) => value.includes("${"))) {
    return page.styles;
  }
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(page.styles)) {
    resolved[key] = value.replace(
      /\$\{([^{}]+)\}/g,
      (match, expression: string) => {
        const next = resolveVariable(expression, page, pages, links);
        return next === null ? match : next;
      },
    );
  }
  return resolved;
}

export function resolveCanvasPageStyles(
  pages: CanvasPageDto[],
  links: CanvasLinkDto[],
): CanvasPageDto[] {
  return pages.map((page) => {
    const styles = resolvePageStyles(page, pages, links);
    return styles === page.styles ? page : { ...page, styles };
  });
}

/**
 * Convert stored pages into the input shape used by the shared layout
 * resolver. Keeping this in one place makes every MCP capability resolve
 * frames exactly like the web canvas does, including data-bound styles.
 */
export function toCanvasLayoutNodes(
  pages: CanvasPageDto[],
  links: CanvasLinkDto[] = [],
): CanvasLayoutNode[] {
  const resolvedPages = resolveCanvasPageStyles(pages, links);
  return resolvedPages.map((page) => ({
    id: page.id,
    x: page.x,
    y: page.y,
    ...(page.parentId ? { parentId: page.parentId } : {}),
    styles: page.styles,
  }));
}

export function resolvePageFrames(
  pages: CanvasPageDto[],
  links: CanvasLinkDto[] = [],
): Map<string, CanvasResolvedFrame> {
  return resolveCanvasLayout(toCanvasLayoutNodes(pages, links));
}

export function collectLayoutIssues(
  frames: Map<string, CanvasResolvedFrame>,
): CanvasLayoutIssue[] {
  const issues: CanvasLayoutIssue[] = [];
  const seen = new Set<string>();

  for (const frame of frames.values()) {
    for (const issue of frame.issues) {
      const key = [
        issue.nodeId,
        issue.code,
        issue.styleKey,
        issue.value,
      ].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(issue);
    }
  }

  return issues;
}

export function collectSubtreeIds(
  pages: CanvasPageDto[],
  rootId: string,
): Set<string> {
  const ids = new Set<string>();
  if (!pages.some((page) => page.id === rootId)) return ids;

  const childrenByParent = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.parentId) continue;
    const list = childrenByParent.get(page.parentId);
    if (list) list.push(page.id);
    else childrenByParent.set(page.parentId, [page.id]);
  }

  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (!id || ids.has(id)) continue;
    ids.add(id);
    for (const childId of childrenByParent.get(id) ?? []) {
      stack.push(childId);
    }
  }

  return ids;
}
