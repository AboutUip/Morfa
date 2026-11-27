import type {
  CanvasBehaviorAction,
  CanvasBehaviorCondition,
  CanvasBehaviorEdge,
  CanvasBehaviorTrigger,
  CanvasLink,
  CanvasPage,
  CanvasWidget,
} from "./canvasDocument";
import {
  getControlState,
  getControlStateSubtree,
  getEffectivePageData,
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
  runtimeNodeData: Record<string, Record<string, string>>;
  controlStates: Record<string, string>;
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
  const states: Record<string, string> = {};

  for (const page of snapshot.pages) {
    states[page.id] = getInitialBehaviorState(page);
  }

  return {
    currentPageId: snapshot.entryPageId,
    navigationStack: [],
    runtimeNodeData: {},
    controlStates: {},
    states,
    overrides: {},
  };
}

export function getRuntimeNodeKey(scope: string | undefined, nodeId: string) {
  return scope ? `${scope}::${nodeId}` : nodeId;
}

function isInsideControlState(
  pages: CanvasPage[],
  page: CanvasPage,
) {
  const pagesById = new Map(pages.map((item) => [item.id, item]));
  const visited = new Set<string>();
  let current: CanvasPage | undefined = page;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.nodeKind === "control-state") return true;
    current = current.parentId
      ? pagesById.get(current.parentId)
      : undefined;
  }
  return false;
}

function resolveRuntimeTargetKey(
  snapshot: RuntimeSnapshot,
  scope: string | undefined,
  targetId: string | undefined,
) {
  if (!scope || !targetId) return targetId;
  const target = snapshot.pages.find((page) => page.id === targetId);
  if (!target) return targetId;
  return isInsideControlState(snapshot.pages, target)
    ? getRuntimeNodeKey(scope, targetId)
    : targetId;
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

function resetControlStateRuntime(
  state: CanvasRuntimeState,
  snapshot: RuntimeSnapshot,
  instanceId: string,
  stateId: string | undefined,
) {
  if (!stateId) return;
  const statePage = getControlState(snapshot.pages, stateId);
  if (!statePage) return;
  for (const page of getControlStateSubtree(snapshot.pages, stateId)) {
    const key = getRuntimeNodeKey(instanceId, page.id);
    delete state.overrides[key];
    const nextState = getInitialBehaviorState(page);
    state.states[key] = nextState;
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

function getNodeDataValue(
  snapshot: RuntimeSnapshot,
  state: CanvasRuntimeState,
  nodeId: string,
  key: string,
  scope?: string,
) {
  const runtimeKey = getRuntimeNodeKey(scope, nodeId);
  const override = state.runtimeNodeData[runtimeKey]?.[key];
  if (override !== undefined) return override;
  const page = snapshot.pages.find((item) => item.id === nodeId);
  if (!page) return "";
  return (
    getEffectivePageData(
      snapshot.pages,
      snapshot.links,
      page,
    ).get(key) ?? ""
  );
}

function setNodeDataValue(
  state: CanvasRuntimeState,
  nodeId: string,
  key: string,
  value: string,
  scope?: string,
) {
  const runtimeKey = getRuntimeNodeKey(scope, nodeId);
  const values = state.runtimeNodeData[runtimeKey] ?? {};
  state.runtimeNodeData[runtimeKey] = { ...values, [key]: value };
}

function applyAction(
  snapshot: RuntimeSnapshot,
  state: CanvasRuntimeState,
  owner: CanvasPage,
  action: CanvasBehaviorAction,
  scope?: string,
) {
  const ownerKey = getRuntimeNodeKey(scope, owner.id);
  const targetKey = resolveRuntimeTargetKey(
    snapshot,
    scope,
    action.targetId,
  );
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
      if (!targetKey || !action.key) return;
      const overrides = getOverrides(state, targetKey);
      setOverride(state, targetKey, {
        styles: {
          ...overrides.styles,
          [action.key]: action.value ?? "",
        },
      });
      return;
    }
    case "setText": {
      if (!targetKey) return;
      setOverride(state, targetKey, { text: action.value ?? "" });
      return;
    }
    case "setVisible": {
      if (!targetKey) return;
      setOverride(state, targetKey, {
        visible: parseBoolean(action.value, true),
      });
      return;
    }
    case "setValue": {
      if (!targetKey) return;
      setOverride(state, targetKey, {
        value: parseNumber(action.value),
      });
      return;
    }
    case "setChecked": {
      if (!targetKey) return;
      setOverride(state, targetKey, {
        checked: parseBoolean(action.value),
      });
      return;
    }
    case "setState": {
      if (action.value) state.states[ownerKey] = action.value;
      return;
    }
    case "setControlState": {
      if (!action.value) return;
      const targetId = action.targetId ?? owner.id;
      const instance = snapshot.pages.find(
        (page) => page.id === targetId,
      );
      const previousState =
        state.controlStates[targetId] ??
        instance?.controlStateId;
      resetControlStateRuntime(
        state,
        snapshot,
        targetId,
        previousState,
      );
      resetControlStateRuntime(
        state,
        snapshot,
        targetId,
        action.value,
      );
      state.controlStates[targetId] = action.value;
      return;
    }
    case "setData": {
      if (!action.key) return;
      setNodeDataValue(
        state,
        action.targetId ?? owner.id,
        action.key,
        action.value ?? "",
        scope,
      );
      return;
    }
    case "incrementData": {
      if (!action.key) return;
      const targetId = action.targetId ?? owner.id;
      const current = parseNumber(
        getNodeDataValue(
          snapshot,
          state,
          targetId,
          action.key,
          scope,
        ),
        0,
      );
      setNodeDataValue(
        state,
        targetId,
        action.key,
        String(current + parseNumber(action.value, 0)),
        scope,
      );
      return;
    }
    case "toggleData": {
      if (!action.key) return;
      const targetId = action.targetId ?? owner.id;
      const current = getNodeDataValue(
        snapshot,
        state,
        targetId,
        action.key,
        scope,
      );
      setNodeDataValue(
        state,
        targetId,
        action.key,
        current === "true" ? "false" : "true",
        scope,
      );
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
  scope?: string,
) {
  const node = snapshot.pages.find((item) => item.id === nodeId);
  if (!node) return "";
  const overrides = state.overrides[getRuntimeNodeKey(scope, nodeId)];

  if (source === "nodeStyle") {
    if (!styleKey) return "";
    return overrides?.styles[styleKey] ?? node.styles[styleKey] ?? "";
  }

  if (source === "state") {
    return (
      state.states[getRuntimeNodeKey(scope, nodeId)] ??
      getInitialBehaviorState(node)
    );
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
  scope?: string,
): boolean {
  const targetId = condition.targetId ?? owner.id;
  let actual: string;
  if (condition.source === "nodeData") {
    actual = condition.key
      ? getNodeDataValue(
          snapshot,
          state,
          targetId,
          condition.key,
          scope,
        )
      : "";
  } else if (condition.source === "controlState") {
    actual = state.controlStates[targetId] ?? "";
  } else {
    actual = getRuntimeNodeValue(
      snapshot,
      state,
      targetId,
      condition.source,
      condition.key,
      scope,
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
  scope?: string,
): boolean {
  const conditions = trigger.conditions ?? [];
  if (conditions.length === 0) return true;
  if (trigger.conditionMode === "any") {
    return conditions.some((condition) =>
      evaluateBehaviorCondition(snapshot, state, owner, condition, scope),
    );
  }
  return conditions.every((condition) =>
    evaluateBehaviorCondition(snapshot, state, owner, condition, scope),
  );
}

function executeTrigger(
  snapshot: RuntimeSnapshot,
  state: CanvasRuntimeState,
  owner: CanvasPage,
  trigger: CanvasBehaviorTrigger,
  scope?: string,
) {
  let remaining = 200;
  for (const action of trigger.actions) {
    if (remaining <= 0) break;
    remaining -= 1;
    applyAction(snapshot, state, owner, action, scope);
  }
}

function getMatchingTriggers(page: CanvasPage, event: string) {
  if (!page.behavior) return [];
  return page.behavior.triggers.filter(
    (trigger) => trigger.event === event,
  );
}

function executeBehaviorGraph(
  snapshot: RuntimeSnapshot,
  state: CanvasRuntimeState,
  owner: CanvasPage,
  event: string,
  scope?: string,
) {
  const behavior = owner.behavior;
  if (!behavior?.blocks?.length) return false;
  const ownerKey = getRuntimeNodeKey(scope, owner.id);

  const blocks = new Map(
    behavior.blocks.map((block) => [block.id, block]),
  );
  const states = new Map(
    behavior.states.map((item) => [item.id, item]),
  );
  const outgoing = new Map<string, CanvasBehaviorEdge[]>();
  for (const edge of behavior.edges ?? []) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }

  const currentState =
    state.states[ownerKey] ?? getInitialBehaviorState(owner);
  const starts = behavior.blocks.filter(
    (block) =>
      block.type === "event" &&
      block.event === event &&
      (!block.stateId || block.stateId === currentState),
  );

  for (const start of starts) {
    const stack: { id: string; visited: Set<string> }[] = [
      { id: start.id, visited: new Set([start.id]) },
    ];
    let steps = 0;

    while (stack.length && steps < 200) {
      const current = stack.pop();
      if (!current) break;
      steps += 1;
      const block = blocks.get(current.id);
      const targetState = states.get(current.id);

      if (targetState) {
        state.states[ownerKey] = targetState.id;
        continue;
      }
      if (!block) continue;

      if (block.type === "condition") {
        if (
          !block.condition ||
          !evaluateBehaviorCondition(
            snapshot,
            state,
            owner,
            block.condition,
            scope,
          )
        ) {
          continue;
        }
      } else if (block.type === "action" && block.action) {
        applyAction(snapshot, state, owner, block.action, scope);
      } else if (block.type === "event") {
        // Entry block: flow continues through outgoing edges.
      }

      for (const edge of outgoing.get(current.id) ?? []) {
        if (current.visited.has(edge.to)) continue;
        const visited = new Set(current.visited);
        visited.add(edge.to);
        stack.push({ id: edge.to, visited });
      }
    }
  }

  return true;
}

export function dispatchRuntimeEvent(
  snapshot: RuntimeSnapshot,
  previous: CanvasRuntimeState,
  nodeId: string,
  event: string,
  scope?: string,
): CanvasRuntimeState {
  const page = snapshot.pages.find((item) => item.id === nodeId);
  if (!page) return previous;
  const ownerKey = getRuntimeNodeKey(scope, page.id);

  const next: CanvasRuntimeState = {
    ...previous,
    navigationStack: [...previous.navigationStack],
    runtimeNodeData: Object.fromEntries(
      Object.entries(previous.runtimeNodeData).map(([id, values]) => [
        id,
        { ...values },
      ]),
    ),
    controlStates: { ...previous.controlStates },
    states: { ...previous.states },
    overrides: Object.fromEntries(
      Object.entries(previous.overrides).map(([id, value]) => [
        id,
        { ...value, styles: { ...value.styles } },
      ]),
    ),
  };

  if (page.behavior?.blocks?.length) {
    executeBehaviorGraph(snapshot, next, page, event, scope);
    return next;
  }

  const currentState =
    next.states[ownerKey] ?? getInitialBehaviorState(page);
  const triggers = getMatchingTriggers(page, event).filter(
    (trigger) =>
      (!trigger.stateId || trigger.stateId === currentState) &&
      evaluateTriggerConditions(
        snapshot,
        next,
        page,
        trigger,
        scope,
      ),
  );

  for (const trigger of triggers) {
    executeTrigger(snapshot, next, page, trigger, scope);
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
