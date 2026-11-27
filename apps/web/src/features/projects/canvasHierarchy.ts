import type { CanvasPage } from "./canvasDocument";

export type LayerDropPosition = "before" | "after" | "inside";

function getPageIdSet(pages: CanvasPage[]) {
  return new Set(pages.map((page) => page.id));
}

export function getPageChildren(pages: CanvasPage[]) {
  const ids = getPageIdSet(pages);
  const children = new Map<string, CanvasPage[]>();

  for (const page of pages) {
    if (!page.parentId || !ids.has(page.parentId)) continue;
    const list = children.get(page.parentId);
    if (list) list.push(page);
    else children.set(page.parentId, [page]);
  }

  return children;
}

export function getRootPages(pages: CanvasPage[]) {
  const ids = getPageIdSet(pages);
  return pages.filter(
    (page) => !page.parentId || !ids.has(page.parentId),
  );
}

/** 选区里真正要平移的节点。父节点已在选区中时，子节点会跟着父节点走。 */
export function topSelectedIds(
  pages: { id: string; parentId?: string }[],
  selectedIds: string[],
) {
  const selected = new Set(selectedIds);
  const parentById = new Map(
    pages.map((page) => [page.id, page.parentId]),
  );

  return selectedIds.filter((id) => {
    const seen = new Set<string>();
    let parentId = parentById.get(id);
    while (parentId && !seen.has(parentId)) {
      if (selected.has(parentId)) return false;
      seen.add(parentId);
      parentId = parentById.get(parentId);
    }
    return true;
  });
}

export function getSubtreeIds(pages: CanvasPage[], pageId: string) {
  const result = new Set<string>();
  if (!pages.some((page) => page.id === pageId)) return result;

  const childrenByPage = getPageChildren(pages);
  const stack = [pageId];

  while (stack.length) {
    const currentId = stack.pop();
    if (!currentId || result.has(currentId)) continue;

    result.add(currentId);
    for (const child of childrenByPage.get(currentId) ?? []) {
      stack.push(child.id);
    }
  }

  return result;
}

export function isPageInSubtree(
  pages: CanvasPage[],
  pageId: string,
  rootId: string,
) {
  return getSubtreeIds(pages, rootId).has(pageId);
}

function orderSubtree(
  pages: CanvasPage[],
  rootId: string,
  subtreeIds: Set<string>,
) {
  const childrenByPage = getPageChildren(pages);
  const ordered: CanvasPage[] = [];
  const visited = new Set<string>();

  const walk = (page: CanvasPage) => {
    if (visited.has(page.id) || !subtreeIds.has(page.id)) return;
    visited.add(page.id);
    ordered.push(page);
    for (const child of childrenByPage.get(page.id) ?? []) {
      walk(child);
    }
  };

  const root = pages.find((page) => page.id === rootId);
  if (root) walk(root);

  for (const page of pages) {
    if (subtreeIds.has(page.id) && !visited.has(page.id)) {
      ordered.push(page);
    }
  }

  return ordered;
}

function withParentId(page: CanvasPage, parentId: string | null) {
  if (parentId) {
    return page.parentId === parentId ? page : { ...page, parentId };
  }

  if (!page.parentId) return page;
  const next = { ...page };
  delete next.parentId;
  return next;
}

/**
 * 在图层树中移动节点：before/after 调整为同级排序，inside 变为目标节点的子项。
 * 返回 null 表示移动无效，例如把父节点拖进自己的子树。
 */
export function movePageInHierarchy(
  pages: CanvasPage[],
  dragId: string,
  targetId: string,
  position: LayerDropPosition,
) {
  if (dragId === targetId) return null;

  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const dragPage = pagesById.get(dragId);
  const targetPage = pagesById.get(targetId);
  if (!dragPage || !targetPage) return null;

  const subtreeIds = getSubtreeIds(pages, dragId);
  if (subtreeIds.has(targetId)) return null;

  const targetParentId =
    targetPage.parentId && pagesById.has(targetPage.parentId)
      ? targetPage.parentId
      : null;
  const nextParentId =
    position === "inside" ? targetPage.id : targetParentId;

  const remaining = pages.filter((page) => !subtreeIds.has(page.id));
  const subtree = orderSubtree(pages, dragId, subtreeIds);
  const targetIndex = remaining.findIndex(
    (page) => page.id === targetId,
  );
  if (targetIndex < 0) return null;

  let insertIndex = targetIndex;
  if (position === "before") {
    insertIndex = targetIndex;
  } else {
    // after / inside 都放在目标整个子树之后，保证父节点排在子节点前。
    const targetSubtree = getSubtreeIds(remaining, targetId);
    let lastTargetIndex = targetIndex;
    remaining.forEach((page, index) => {
      if (targetSubtree.has(page.id)) lastTargetIndex = index;
    });
    insertIndex = lastTargetIndex + 1;
  }

  const nextSubtree = subtree.map((page, index) =>
    index === 0 ? withParentId(page, nextParentId) : page,
  );

  return [
    ...remaining.slice(0, insertIndex),
    ...nextSubtree,
    ...remaining.slice(insertIndex),
  ];
}
