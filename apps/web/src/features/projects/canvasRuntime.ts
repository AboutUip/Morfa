import type {
  CanvasBehaviorAction,
  CanvasBehaviorCondition,
  CanvasBehaviorTrigger,
  CanvasLink,
  CanvasPage,
  CanvasWidget,
} from "./canvasDocument";
import { getInitialBehaviorState } from "./canvasBehavior";

export interface RuntimeSnapshot {
  containerId: string;
  entryPageId: string;
  pages: CanvasPage[];
  links: CanvasLink[];
  compiledAt: number;
}

export interface RuntimeNodeOverrides {
  styles: Record<string, string>;
  text?: string;
  value?: number;
  checked?: boolean;
  visible?: boolean;
}

export interface CanvasRuntimeState {
  currentPageId: string;
  navigationStack: string[];
  variables: Record<string, string>;
  states: Record<string, string>;
  overrides: Record<string, RuntimeNodeOverrides>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createRuntimeSnapshot(
  pages: CanvasPage[],
  links: CanvasLink[],
  containerId: string,
  entryPageId: string,
): RuntimeSnapshot {
  return {
    containerId,
    entryPageId,
    pages: clone(pages),
    links: clone(links),
    compiledAt: Date.now(),
  };
}

export function getRuntimePage(
  snapshot: RuntimeSnapshot,
  pageId: string,
) {
  return snapshot.pages.find((page) => page.id === pageId) ?? null;
}

export function getPageSubtreeIds(pages: CanvasPage[], pageId: string) {
  const result = new Set<string>([pageId]);
  const children = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.parentId) continue;
    const list = children.get(page.parentId);
    if (list) list.push(page.id);
    else children.set(page.parentId, [page.id]);
  }
  const stack = [pageId];
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    for (const child of children.get(id) ?? []) {
      if (result.has(child)) continue;
      result.add(child);
      stack.push(child);
    }
  }
  return result;
}

export function createRuntimeState(
  snapshot: RuntimeSnapshot,
): CanvasRuntimeState {
  const variables: Record<string, string> = {};
  const states: Record<string, string> = {};

  for (const page of snapshot.pages) {
    if (page.behavior) {
      for (const variable of page.behavior.variables) {
        variables[variable.key] = variable.initialValue;
      }
    }
    states[page.id] = getInitialBehaviorState(page);
  }

  return {
    currentPageId: snapshot.entryPageId,
    navigationStack: [],
    variables,
    states,
    overrides: {},
  };
}

function getOverrides(
  state: CanvasRuntimeState,
  nodeId: string,
): RuntimeNodeOverrides {
  return (
    state.overrides[nodeId] ?? {
      styles: {},
    }
  );
}

function setOverride(
  state: CanvasRuntimeState,
  nodeId: string,
  patch: Partial<RuntimeNodeOverrides>,
) {
  const current = getOverrides(state, nodeId);
  state.overrides[nodeId] = {
    ...current,
    ...patch,
    styles: {
      ...current.styles,
      ...(patch.styles ?? {}),
    },
  };
}

function resetPageRuntime(
  state: CanvasRuntimeState,
  snapshot: RuntimeSnapshot,
  pageId: string,
) {
  const ids = getPageSubtreeIds(snapshot.pages, pageId);
  for (const id of ids) {
    delete state.overrides[id];
    const page = snapshot.pages.find((item) => item.id === id);
    if (page) state.states[id] = getInitialBehaviorState(page);
  }
}

function parseBoolean(value: string | undefined, fallback = false) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function parseNumber(value: string | undefined, fallback = 0) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function applyAction(
  snapshot: RuntimeSnapshot,
  state: CanvasRuntimeState,
  owner: CanvasPage,
  action: CanvasBehaviorAction,
) {
  switch (action.type) {
    case "navigate": {
      if (!action.pageId || action.pageId === state.currentPageId) return;
      if (!snapshot.pages.some((page) => page.id === action.pageId)) return;
      state.navigationStack.push(state.currentPageId);
      state.currentPageId = action.pageId;
      resetPageRuntime(state, snapshot, action.pageId);
      return;
    }
    case "setStyle": {
      if (!action.targetId || !action.key) return;
      const overrides = getOverrides(state, action.targetId);
      setOverride(state, action.targetId, {
        styles: {
          ...overrides.styles,
          [action.key]: action.value ?? "",
        },
      });
      return;
    }
    case "setText": {
      if (!action.targetId) return;
      setOverride(state, action.targetId, { text: action.value ?? "" });
      return;
    }
    case "setVisible": {
      if (!action.targetId) return;
      setOverride(state, action.targetId, {
        visible: parseBoolean(action.value, true),
      });
      return;
    }
    case "setValue": {
      if (!action.targetId) return;
      setOverride(state, action.targetId, {
        value: parseNumber(action.value),
      });
      return;
    }
    case "setChecked": {
      if (!action.targetId) return;
      setOverride(state, action.targetId, {
        checked: parseBoolean(action.value),
      });
      return;
    }
    case "setState": {
      if (action.value) state.states[owner.id] = action.value;
      return;
    }
    case "setVariable": {
      if (!action.key) return;
      state.variables[action.key] = action.value ?? "";
      return;
    }
    case "incrementVariable": {
      if (!action.key) return;
      const current = parseNumber(state.variables[action.key], 0);
      state.variables[action.key] = String(
        current + parseNumber(action.value, 0),
      );
      return;
    }
    case "toggleVariable": {
      if (!action.key) return;
      state.variables[action.key] =
        state.variables[action.key] === "true" ? "false" : "true";
      return;
    }
  }
}

function getRuntimeNodeValue(
  snapshot: RuntimeSnapshot,
  state: CanvasRuntimeState,
  nodeId: string,
  source: CanvasBehaviorCondition["source"],
  styleKey?: string,
) {
  const node = snapshot.pages.find((item) => item.id === nodeId);
  if (!node) return "";
  const overrides = state.overrides[nodeId];

  if (source === "nodeStyle") {
    if (!styleKey) return "";
    return overrides?.styles[styleKey] ?? node.styles[styleKey] ?? "";
  }

  if (source === "state") {
    return state.states[nodeId] ?? getInitialBehaviorState(node);
  }
  if (source === "nodeVisible") {
    if (overrides?.visible !== undefined) {
      return overrides.visible ? "true" : "false";
    }
    return node.styles.display === "none" ? "false" : "true";
  }
  if (source === "nodeText") {
    return overrides?.text ?? node.widget?.text ?? "";
  }
  if (source === "nodeValue") {
    return String(overrides?.value ?? node.widget?.value ?? 0);
  }
  return "";
}

export function evaluateBehaviorCondition(
  snapshot: RuntimeSnapshot,
  state: CanvasRuntimeState,
  owner: CanvasPage,
  condition: CanvasBehaviorCondition,
): boolean {
  let actual: string;
  if (condition.source === "variable") {
    actual = condition.key ? state.variables[condition.key] ?? "" : "";
  } else {
    actual = getRuntimeNodeValue(
      snapshot,
      state,
      condition.targetId ?? owner.id,
      condition.source,
      condition.key,
    );
  }

  const expected = condition.value;
  let matched = false;
  switch (condition.operator) {
    case "eq":
      matched = actual === expected;
      break;
    case "neq":
      matched = actual !== expected;
      break;
    case "contains":
      matched = actual.includes(expected);
      break;
    case "notContains":
      matched = !actual.includes(expected);
      break;
    case "gt":
      matched = Number.parseFloat(actual) > Number.parseFloat(expected);
      break;
    case "gte":
      matched = Number.parseFloat(actual) >= Number.parseFloat(expected);
      break;
    case "lt":
      matched = Number.parseFloat(actual) < Number.parseFloat(expected);
      break;
    case "lte":
      matched = Number.parseFloat(actual) <= Number.parseFloat(expected);
      break;
  }
  return condition.negate ? !matched : matched;
}

export function evaluateTriggerConditions(
  snapshot: RuntimeSnapshot,
  state: CanvasRuntimeState,
  owner: CanvasPage,
  trigger: CanvasBehaviorTrigger,
): boolean {
  const conditions = trigger.conditions ?? [];
  if (conditions.length === 0) return true;
  if (trigger.conditionMode === "any") {
    return conditions.some((condition) =>
      evaluateBehaviorCondition(snapshot, state, owner, condition),
    );
  }
  return conditions.every((condition) =>
    evaluateBehaviorCondition(snapshot, state, owner, condition),
  );
}

function executeTrigger(
  snapshot: RuntimeSnapshot,
  state: CanvasRuntimeState,
  owner: CanvasPage,
  trigger: CanvasBehaviorTrigger,
) {
  let remaining = 200;
  for (const action of trigger.actions) {
    if (remaining <= 0) break;
    remaining -= 1;
    applyAction(snapshot, state, owner, action);
  }
}

function getMatchingTriggers(page: CanvasPage, event: string) {
  if (!page.behavior) return [];
  return page.behavior.triggers.filter(
    (trigger) => trigger.event === event,
  );
}

export function dispatchRuntimeEvent(
  snapshot: RuntimeSnapshot,
  previous: CanvasRuntimeState,
  nodeId: string,
  event: string,
): CanvasRuntimeState {
  const page = snapshot.pages.find((item) => item.id === nodeId);
  if (!page) return previous;

  const next: CanvasRuntimeState = {
    ...previous,
    navigationStack: [...previous.navigationStack],
    variables: { ...previous.variables },
    states: { ...previous.states },
    overrides: Object.fromEntries(
      Object.entries(previous.overrides).map(([id, value]) => [
        id,
        { ...value, styles: { ...value.styles } },
      ]),
    ),
  };

  const currentState = next.states[page.id] ?? getInitialBehaviorState(page);
  const triggers = getMatchingTriggers(page, event).filter(
    (trigger) =>
      (!trigger.stateId || trigger.stateId === currentState) &&
      evaluateTriggerConditions(snapshot, next, page, trigger),
  );

  for (const trigger of triggers) {
    executeTrigger(snapshot, next, page, trigger);
  }

  return next;
}

export function dispatchPageLoad(
  snapshot: RuntimeSnapshot,
  previous: CanvasRuntimeState,
  pageId: string,
): CanvasRuntimeState {
  const page = snapshot.pages.find((item) => item.id === pageId);
  if (!page) return previous;
  return dispatchRuntimeEvent(snapshot, previous, pageId, "load");
}

export function applyWidgetRuntimeOverrides(
  widget: CanvasWidget | undefined,
  overrides: RuntimeNodeOverrides | undefined,
): CanvasWidget | undefined {
  if (!widget || !overrides) return widget;
  return {
    ...widget,
    ...(overrides.text !== undefined ? { text: overrides.text } : {}),
    ...(overrides.value !== undefined ? { value: overrides.value } : {}),
    ...(overrides.checked !== undefined
      ? { checked: overrides.checked }
      : {}),
  };
}

export function runtimeStyleVariables(
  overrides: RuntimeNodeOverrides | undefined,
) {
  const result: Record<string, string> = {};
  if (!overrides) return result;
  const styles = overrides.styles;
  if (styles["background-color"]) {
    result.backgroundColor = styles["background-color"];
    result["--mf-runtime-bg"] = styles["background-color"];
  }
  if (styles.color) {
    result.color = styles.color;
    result["--mf-runtime-color"] = styles.color;
  }
  if (styles["border-color"]) {
    result.borderColor = styles["border-color"];
    result["--mf-runtime-border"] = styles["border-color"];
  }
  if (styles.opacity) result.opacity = styles.opacity;
  if (styles["border-radius"]) {
    result.borderRadius = styles["border-radius"];
  }
  if (styles.display) result.display = styles.display;
  if (overrides.visible === false) result.display = "none";
  return result;
}
