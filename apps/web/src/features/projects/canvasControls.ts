import { collectBehaviorLint } from "./canvasBehavior";
import {
  getControlStateKey,
  getScopeInstanceId,
} from "./canvasRuntime";
import {
  collectCanvasLint,
  computeControlSignature,
  createPageId,
  createPageStyles,
  getControlDisplayState,
  getControlState,
  getControlStates,
  getControlStateSubtree,
  getPageSize,
  isControlDefinitionPage,
  isControlInstancePage,
  uniquePageName,
  type CanvasControlMeta,
  type CanvasLink,
  type CanvasLintItem,
  type CanvasPage,
} from "./canvasDocument";

export const CONTROL_DRAG_MIME = "application/x-morfa-control";

export type ControlTarget = NonNullable<CanvasControlMeta["target"]>;

export interface CreateControlInput {
  name: string;
  description?: string;
  target: ControlTarget;
  width: number;
  height: number;
}

export interface CreateControlPagesOptions {
  defaultStateName: string;
}

export interface ControlInstancePosition {
  x: number;
  y: number;
  parentId?: string;
}

/**
 * A control state is a normal canvas subtree. Instances should keep a
 * transparent frame and let the state root paint the actual control.
 */
const CONTROL_FRAME_STYLES: Record<string, string> = {
  "background-color": "transparent",
  "border-color": "transparent",
  "border-style": "none",
  "border-width": "0",
  "box-shadow": "none",
};

function normalizeControlSize(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(8, Math.min(4000, Math.round(value)));
}

export function getControlPreviewState(
  pages: CanvasPage[],
  controlId: string,
) {
  const control = pages.find(
    (page) => isControlDefinitionPage(page) && page.id === controlId,
  );
  if (!control?.control) return null;
  const states = getControlStates(pages, controlId);
  return (
    states.find((state) => state.id === control.control?.defaultStateId) ??
    states[0] ??
    null
  );
}

export type ControlStateDeleteBlock =
  | "missing"
  | "default"
  | "last";

/**
 * Delete guards shared by the control toolbar and the workspace. The server
 * enforces the same rules; keeping them pure makes the UI feedback testable.
 */
export function getControlStateDeleteBlock(
  states: Pick<CanvasPage, "id">[],
  defaultStateId: string | undefined,
  stateId: string | null,
): ControlStateDeleteBlock | null {
  if (!stateId || !states.some((state) => state.id === stateId)) {
    return "missing";
  }
  if (states.length <= 1) return "last";
  if (stateId === defaultStateId) return "default";
  return null;
}

export function isControlDirty(pages: CanvasPage[], controlId: string) {
  const control = pages.find(
    (page) => isControlDefinitionPage(page) && page.id === controlId,
  );
  if (!control?.control) return false;
  return (
    control.control.compiledSig !==
    computeControlSignature(pages, controlId)
  );
}

export function createControlPages(
  pages: CanvasPage[],
  input: CreateControlInput,
  options: CreateControlPagesOptions,
): { control: CanvasPage; state: CanvasPage } {
  const controlId = createPageId(pages);
  let stateId = createPageId(pages);
  while (stateId === controlId) {
    stateId = createPageId([...pages, { id: controlId } as CanvasPage]);
  }
  const width = normalizeControlSize(input.width, 240);
  const height = normalizeControlSize(input.height, 120);
  const name = uniquePageName(input.name.trim(), pages);
  const description = input.description?.trim() ?? "";

  const control: CanvasPage = {
    id: controlId,
    name,
    x: 0,
    y: 0,
    styles: {
      ...createPageStyles(),
      width: `${width}px`,
      height: `${height}px`,
      ...CONTROL_FRAME_STYLES,
    },
    nodeKind: "control",
    control: {
      status: "draft",
      defaultStateId: stateId,
      ...(description ? { description } : {}),
      target: input.target,
    },
  };

  const state: CanvasPage = {
    id: stateId,
    name: options.defaultStateName,
    x: 0,
    y: 0,
    styles: {
      ...createPageStyles(),
      width: `${width}px`,
      height: `${height}px`,
      ...CONTROL_FRAME_STYLES,
    },
    nodeKind: "control-state",
    controlId,
  };

  return { control, state };
}

export function createControlStatePage(
  pages: CanvasPage[],
  control: CanvasPage,
  name: string,
  width: number,
  height: number,
): CanvasPage {
  const stateId = createPageId(pages);
  const states = getControlStates(pages, control.id);
  const fallback = getControlPreviewState(pages, control.id);
  const fallbackWidth = fallback
    ? getPageSize(fallback, pages).width
    : normalizeControlSize(width, 240);
  const fallbackHeight = fallback
    ? getPageSize(fallback, pages).height
    : normalizeControlSize(height, 120);

  return {
    id: stateId,
    name:
      name.trim() ||
      `${control.name} ${states.length + 1}`,
    x: 0,
    y: 0,
    styles: {
      ...createPageStyles(),
      width: `${Math.round(fallbackWidth)}px`,
      height: `${Math.round(fallbackHeight)}px`,
      ...CONTROL_FRAME_STYLES,
    },
    nodeKind: "control-state",
    controlId: control.id,
  };
}

export type ControlNestingBlock =
  | "missing"
  | "uncompiled"
  | "cycle";

/**
 * Transitive control dependencies. A dependency is any control instance found
 * inside one of the control's state trees, including deeper nested controls.
 */
export function getControlDependencyIds(
  pages: CanvasPage[],
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
  pages: CanvasPage[],
  ownerControlId: string,
  nestedControlId: string,
): ControlNestingBlock | null {
  if (ownerControlId === nestedControlId) return "cycle";
  const nested = pages.find(
    (page) =>
      isControlDefinitionPage(page) && page.id === nestedControlId,
  );
  if (!nested?.control) return "missing";
  if (nested.control.status !== "compiled") return "uncompiled";
  if (getControlDependencyIds(pages, nestedControlId).has(ownerControlId)) {
    return "cycle";
  }
  return null;
}

export function createControlInstancePage(
  pages: CanvasPage[],
  links: CanvasLink[],
  controlId: string,
  position: ControlInstancePosition,
  ownerControlId?: string,
): CanvasPage | null {
  const control = pages.find(
    (page) => isControlDefinitionPage(page) && page.id === controlId,
  );
  if (!control?.control || control.control.status !== "compiled") {
    return null;
  }
  if (
    ownerControlId &&
    getControlNestingBlock(pages, ownerControlId, controlId)
  ) {
    return null;
  }

  const state = getControlPreviewState(pages, controlId);
  if (!state) return null;
  const size = getPageSize(state, pages, links);

  return {
    id: createPageId(pages),
    name: uniquePageName(control.name, pages),
    x: position.x,
    y: position.y,
    ...(position.parentId ? { parentId: position.parentId } : {}),
    styles: {
      ...createPageStyles(),
      width: `${Math.max(1, Math.round(size.width))}px`,
      height: `${Math.max(1, Math.round(size.height))}px`,
      ...CONTROL_FRAME_STYLES,
    },
    nodeKind: "control-instance",
    controlId,
    controlStateId: state.id,
  };
}

/**
 * Pages the control behavior editor may reference: the definition plus every
 * state variant and its child tree. Keeping all variants here lets a state
 * root trigger switch an instance to another state.
 */
export function getControlDocumentPages(
  pages: CanvasPage[],
  controlId: string,
) {
  const result: CanvasPage[] = [];
  const seen = new Set<string>();
  const control = pages.find(
    (page) => isControlDefinitionPage(page) && page.id === controlId,
  );
  if (control) {
    result.push(control);
    seen.add(control.id);
  }
  for (const state of getControlStates(pages, controlId)) {
    for (const page of getControlStateSubtree(pages, state.id)) {
      if (seen.has(page.id)) continue;
      seen.add(page.id);
      result.push(page);
    }
  }
  return result;
}

/**
 * Compile validation uses the same lint collectors as the rest of the canvas.
 * Canvas lint runs without project links because a control state tree is a
 * self-contained scope; behavior lint adds graph/state errors.
 */
export function collectControlLintItems(
  pages: CanvasPage[],
  controlId: string,
): CanvasLintItem[] {
  const items: CanvasLintItem[] = [];
  const seen = new Set<string>();
  const add = (item: CanvasLintItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  const control = pages.find(
    (page) => isControlDefinitionPage(page) && page.id === controlId,
  );
  if (!control?.control) {
    add({
      id: `control:${controlId}:missing`,
      severity: "error",
      pageId: controlId,
      pageName: control?.name ?? controlId,
      styleKey: "control",
      expression: "",
      code: "control",
      messageKey: "projects.workspace.controls.errors.controlMissing",
    });
    return items;
  }

  const states = getControlStates(pages, controlId);
  if (states.length === 0) {
    add({
      id: `control:${controlId}:no-states`,
      severity: "error",
      pageId: controlId,
      pageName: control.name,
      styleKey: "control",
      expression: "",
      code: "control",
      messageKey: "projects.workspace.controls.errors.noStates",
    });
  }
  if (
    control.control.defaultStateId &&
    !states.some((state) => state.id === control.control?.defaultStateId)
  ) {
    add({
      id: `control:${controlId}:default-state`,
      severity: "error",
      pageId: controlId,
      pageName: control.name,
      styleKey: "control",
      expression: control.control.defaultStateId,
      code: "control",
      messageKey: "projects.workspace.controls.errors.defaultStateMissing",
    });
  }

  for (const state of states) {
    for (const page of getControlStateSubtree(pages, state.id)) {
      if (!isControlInstancePage(page) || !page.controlId) continue;
      const blocked = getControlNestingBlock(
        pages,
        controlId,
        page.controlId,
      );
      if (!blocked) continue;
      add({
        id: `control:${controlId}:nested:${page.id}`,
        severity: "error",
        pageId: page.id,
        pageName: page.name,
        styleKey: "control",
        expression: page.controlId,
        code: "control",
        messageKey:
          blocked === "missing"
            ? "projects.workspace.controls.errors.nestedControlMissing"
            : blocked === "uncompiled"
              ? "projects.workspace.controls.errors.nestedControlUncompiled"
              : "projects.workspace.controls.errors.nestedControlCycle",
      });
    }
  }

  const controlPages = getControlDocumentPages(pages, controlId);
  for (const item of collectCanvasLint(controlPages, [])) {
    add(item);
  }

  for (const issue of collectBehaviorLint(controlPages)) {
    add({
      id: `control-behavior:${issue.id}`,
      severity: issue.severity,
      pageId: issue.pageId,
      pageName: issue.pageName,
      styleKey: "behavior",
      expression: issue.triggerId ?? issue.actionId ?? "behavior",
      code: "control",
      messageKey: issue.messageKey,
      messageParams: issue.params,
    });
  }

  return items;
}

/**
 * Translate a state-root (or state-child) `setControlState` action to the
 * owning instance at runtime. Inside a control definition the action can only
 * target the definition's state node, but instances each have their own id.
 */
export function remapControlStateEvent<
  T extends { controlStates: Record<string, string> },
>(
  pages: CanvasPage[],
  previous: T,
  next: T,
  scope: string,
): T {
  const instanceId = getScopeInstanceId(scope);
  const instance = pages.find(
    (page) => isControlInstancePage(page) && page.id === instanceId,
  );
  if (!instance?.controlId) return next;

  const requestedStateId =
    previous.controlStates[scope] ?? instance.controlStateId;
  const stateRoot =
    getControlState(pages, requestedStateId) ??
    getControlDisplayState(pages, instance);
  if (!stateRoot) return next;

  const validStateIds = new Set(
    getControlStates(pages, instance.controlId).map((state) => state.id),
  );
  if (validStateIds.size === 0) return next;

  const stateKey = getControlStateKey(scope, instanceId);
  const subtree = getControlStateSubtree(pages, stateRoot.id);
  for (const page of subtree) {
    // Legacy graph actions may target the state root page instead of the
    // owning instance. Those are the only keys that need remapping; scoped
    // nested-instance keys are already addressed by getControlStateKey.
    if (page.nodeKind !== "control-state") continue;
    const value = next.controlStates[page.id];
    if (!value || !validStateIds.has(value)) continue;
    if (value === previous.controlStates[page.id]) continue;
    next.controlStates[stateKey] = value;
    delete next.controlStates[page.id];
  }

  return next;
}
