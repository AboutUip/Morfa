import type { CanvasPageDto } from "./canvasDocuments.js";

export function isControlPage(page: CanvasPageDto) {
  return page.nodeKind === "control";
}

export function isControlStatePage(page: CanvasPageDto) {
  return page.nodeKind === "control-state";
}

export function isControlInstancePage(page: CanvasPageDto) {
  return page.nodeKind === "control-instance";
}

export function isHiddenCanvasPage(page: CanvasPageDto) {
  return isControlPage(page) || isControlStatePage(page);
}

export function getControlPages(pages: CanvasPageDto[]) {
  return pages.filter(isControlPage);
}

export function getControlStates(
  pages: CanvasPageDto[],
  controlId: string,
) {
  return pages.filter(
    (page) =>
      isControlStatePage(page) && page.controlId === controlId,
  );
}

export function getControlStateSubtree(
  pages: CanvasPageDto[],
  stateId: string,
) {
  const state = pages.find(
    (page) => isControlStatePage(page) && page.id === stateId,
  );
  if (!state) return [];
  const childrenByParent = new Map<string, CanvasPageDto[]>();
  for (const page of pages) {
    if (!page.parentId || isHiddenCanvasPage(page)) {
      continue;
    }
    const list = childrenByParent.get(page.parentId);
    if (list) list.push(page);
    else childrenByParent.set(page.parentId, [page]);
  }
  const result: CanvasPageDto[] = [];
  const stack = [state];
  const seen = new Set<string>();
  while (stack.length) {
    const page = stack.pop();
    if (!page || seen.has(page.id)) continue;
    seen.add(page.id);
    result.push(page);
    for (const child of childrenByParent.get(page.id) ?? []) {
      stack.push(child);
    }
  }
  return result;
}

export function getControlStateNodes(
  pages: CanvasPageDto[],
  stateId: string,
) {
  return getControlStateSubtree(pages, stateId).filter(
    (page) => page.id !== stateId,
  );
}

export type ControlNestingBlock =
  | "missing"
  | "uncompiled"
  | "cycle";

export function getControlDependencyIds(
  pages: CanvasPageDto[],
  controlId: string,
) {
  const dependencies = new Set<string>();
  const stack = [controlId];
  const visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const state of getControlStates(pages, current)) {
      for (const page of getControlStateSubtree(pages, state.id)) {
        if (!isControlInstancePage(page) || !page.controlId) continue;
        dependencies.add(page.controlId);
        stack.push(page.controlId);
      }
    }
  }
  return dependencies;
}

export function getControlNestingBlock(
  pages: CanvasPageDto[],
  ownerControlId: string,
  nestedControlId: string,
): ControlNestingBlock | null {
  if (ownerControlId === nestedControlId) return "cycle";
  const nested = pages.find(
    (page) => isControlPage(page) && page.id === nestedControlId,
  );
  if (!nested?.control) return "missing";
  if (nested.control.status !== "compiled") return "uncompiled";
  if (getControlDependencyIds(pages, nestedControlId).has(ownerControlId)) {
    return "cycle";
  }
  return null;
}

export function getOwnerControlIdForParent(
  pages: CanvasPageDto[],
  parentId: string,
) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  let current = byId.get(parentId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (isControlStatePage(current) && current.controlId) {
      return current.controlId;
    }
    current = current.parentId
      ? byId.get(current.parentId)
      : undefined;
  }
  return null;
}

export function getCompiledControls(pages: CanvasPageDto[]) {
  return getControlPages(pages).filter(
    (page) => page.control?.status === "compiled",
  );
}

export function getControlInstances(
  pages: CanvasPageDto[],
  controlId: string,
) {
  return pages.filter(
    (page) =>
      isControlInstancePage(page) && page.controlId === controlId,
  );
}

export function computeControlSignature(
  pages: CanvasPageDto[],
  controlId: string,
) {
  const control = pages.find(
    (page) => isControlPage(page) && page.id === controlId,
  );
  if (!control) return "";
  const states = getControlStates(pages, controlId)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((state) => ({
      id: state.id,
      name: state.name,
      styles: state.styles,
      nodes: getControlStateSubtree(pages, state.id)
        .filter((page) => page.id !== state.id)
        .map((page) => ({
          id: page.id,
          name: page.name,
          parentId: page.parentId ?? null,
          x: page.x,
          y: page.y,
          styles: page.styles,
          widget: page.widget ?? null,
          data: page.data ?? [],
          behavior: page.behavior ?? null,
          nestedControl:
            page.nodeKind === "control-instance" && page.controlId
              ? {
                  id: page.controlId,
                  compiledSig:
                    pages.find(
                      (item) =>
                        item.nodeKind === "control" &&
                        item.id === page.controlId,
                    )?.control?.compiledSig ?? null,
                  compiledRevision:
                    pages.find(
                      (item) =>
                        item.nodeKind === "control" &&
                        item.id === page.controlId,
                    )?.control?.compiledRevision ?? null,
                }
              : null,
        })),
    }));
  return JSON.stringify({
    id: control.id,
    name: control.name,
    behavior: control.behavior ?? null,
    states,
  });
}

export function getControlSummary(
  pages: CanvasPageDto[],
  control: CanvasPageDto,
  origin?: string,
) {
  const states = getControlStates(pages, control.id);
  const signature = computeControlSignature(pages, control.id);
  const defaultState = states.find(
    (state) => state.id === control.control?.defaultStateId,
  );
  return {
    id: control.id,
    name: control.name,
    description: control.control?.description ?? "",
    target: control.control?.target ?? "both",
    status: control.control?.status ?? "draft",
    defaultStateId: control.control?.defaultStateId ?? null,
    compiledAt: control.control?.compiledAt ?? null,
    compiledRevision: control.control?.compiledRevision ?? null,
    dirty:
      control.control?.status === "compiled" &&
      control.control.compiledSig !== signature,
    size: defaultState
      ? {
          width: defaultState.styles.width ?? "800px",
          height: defaultState.styles.height ?? "600px",
        }
      : null,
    states: states.map((state) => ({
      id: state.id,
      name: state.name,
      width: state.styles.width ?? "800px",
      height: state.styles.height ?? "600px",
      nodeCount: getControlStateSubtree(pages, state.id).length - 1,
      default: state.id === control.control?.defaultStateId,
    })),
  };
}
