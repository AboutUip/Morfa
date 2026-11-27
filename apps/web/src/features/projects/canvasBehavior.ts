import { getSupportedCanvasEvents } from "@morfa/shared/canvas-behavior";

import type {
  CanvasBehavior,
  CanvasBehaviorAction,
  CanvasBehaviorActionType,
  CanvasBehaviorBlock,
  CanvasBehaviorCondition,
  CanvasBehaviorConditionOperator,
  CanvasBehaviorConditionSource,
  CanvasBehaviorEdge,
  CanvasBehaviorState,
  CanvasBehaviorTrigger,
  CanvasPage,
} from "./canvasDocument";
import {
  WIDGET_CHECKED_KINDS,
  WIDGET_TEXT_KINDS,
  WIDGET_VALUE_KINDS,
} from "./canvasWidgetCatalog";

export type BehaviorLintSeverity = "error" | "warning";

export interface CanvasBehaviorLintIssue {
  id: string;
  pageId: string;
  pageName: string;
  severity: BehaviorLintSeverity;
  messageKey: string;
  params?: Record<string, string | number>;
  triggerId?: string;
  actionId?: string;
  conditionId?: string;
  blockId?: string;
  edgeId?: string;
  stateId?: string;
}

export interface BehaviorActionDefinition {
  type: CanvasBehaviorActionType;
  labelKey: string;
  needsTarget: boolean;
  needsValue: boolean;
}

export const BEHAVIOR_ACTION_DEFINITIONS: readonly BehaviorActionDefinition[] =
  [
    {
      type: "navigate",
      labelKey: "projects.workspace.behavior.actions.navigate",
      needsTarget: false,
      needsValue: false,
    },
    {
      type: "setStyle",
      labelKey: "projects.workspace.behavior.actions.setStyle",
      needsTarget: true,
      needsValue: true,
    },
    {
      type: "setText",
      labelKey: "projects.workspace.behavior.actions.setText",
      needsTarget: true,
      needsValue: true,
    },
    {
      type: "setVisible",
      labelKey: "projects.workspace.behavior.actions.setVisible",
      needsTarget: true,
      needsValue: true,
    },
    {
      type: "setValue",
      labelKey: "projects.workspace.behavior.actions.setValue",
      needsTarget: true,
      needsValue: true,
    },
    {
      type: "setChecked",
      labelKey: "projects.workspace.behavior.actions.setChecked",
      needsTarget: true,
      needsValue: true,
    },
    {
      type: "setState",
      labelKey: "projects.workspace.behavior.actions.setState",
      needsTarget: false,
      needsValue: true,
    },
    {
      type: "setControlState",
      labelKey: "projects.workspace.behavior.actions.setControlState",
      needsTarget: true,
      needsValue: true,
    },
    {
      type: "setData",
      labelKey: "projects.workspace.behavior.actions.setData",
      needsTarget: true,
      needsValue: true,
    },
    {
      type: "incrementData",
      labelKey: "projects.workspace.behavior.actions.incrementData",
      needsTarget: true,
      needsValue: true,
    },
    {
      type: "toggleData",
      labelKey: "projects.workspace.behavior.actions.toggleData",
      needsTarget: true,
      needsValue: false,
    },
  ];

export type BehaviorConditionSourceDefinition = {
  source: CanvasBehaviorConditionSource;
  labelKey: string;
  needsKey: boolean;
  needsTarget: boolean;
  numeric: boolean;
};

export const BEHAVIOR_CONDITION_SOURCES: readonly BehaviorConditionSourceDefinition[] =
  [
    {
      source: "nodeData",
      labelKey: "projects.workspace.behavior.conditions.sources.nodeData",
      needsKey: true,
      needsTarget: true,
      numeric: false,
    },
    {
      source: "state",
      labelKey: "projects.workspace.behavior.conditions.sources.state",
      needsKey: false,
      needsTarget: true,
      numeric: false,
    },
    {
      source: "controlState",
      labelKey: "projects.workspace.behavior.conditions.sources.controlState",
      needsKey: false,
      needsTarget: true,
      numeric: false,
    },
    {
      source: "nodeVisible",
      labelKey: "projects.workspace.behavior.conditions.sources.nodeVisible",
      needsKey: false,
      needsTarget: true,
      numeric: false,
    },
    {
      source: "nodeText",
      labelKey: "projects.workspace.behavior.conditions.sources.nodeText",
      needsKey: false,
      needsTarget: true,
      numeric: false,
    },
    {
      source: "nodeValue",
      labelKey: "projects.workspace.behavior.conditions.sources.nodeValue",
      needsKey: false,
      needsTarget: true,
      numeric: true,
    },
    {
      source: "nodeStyle",
      labelKey: "projects.workspace.behavior.conditions.sources.nodeStyle",
      needsKey: true,
      needsTarget: true,
      numeric: false,
    },
  ];

export const BEHAVIOR_CONDITION_OPERATORS: readonly {
  operator: CanvasBehaviorConditionOperator;
  symbol: string;
}[] = [
  { operator: "eq", symbol: "=" },
  { operator: "neq", symbol: "≠" },
  { operator: "gt", symbol: ">" },
  { operator: "gte", symbol: "≥" },
  { operator: "lt", symbol: "<" },
  { operator: "lte", symbol: "≤" },
  { operator: "contains", symbol: "⊃" },
  { operator: "notContains", symbol: "⊅" },
];

export function createBehaviorCondition(
  source: CanvasBehaviorConditionSource = "nodeData",
): CanvasBehaviorCondition {
  return {
    id: makeId("c"),
    source,
    ...(source === "nodeData" || source === "nodeStyle"
      ? { key: "" }
      : {}),
    ...(source === "nodeVisible" ? { value: "true" } : {}),
    operator: "eq",
    value: source === "nodeVisible" ? "true" : "",
  };
}

export const BEHAVIOR_STYLE_KEYS = [
  "background-color",
  "color",
  "border-color",
  "opacity",
  "border-radius",
  "display",
] as const;

const EVENT_LABEL_KEYS: Record<string, string> = {
  click: "projects.workspace.behavior.events.click",
  doubleClick: "projects.workspace.behavior.events.doubleClick",
  hoverEnter: "projects.workspace.behavior.events.hoverEnter",
  hoverLeave: "projects.workspace.behavior.events.hoverLeave",
  load: "projects.workspace.behavior.events.load",
  input: "projects.workspace.behavior.events.input",
  change: "projects.workspace.behavior.events.change",
  focus: "projects.workspace.behavior.events.focus",
  blur: "projects.workspace.behavior.events.blur",
  open: "projects.workspace.behavior.events.open",
  close: "projects.workspace.behavior.events.close",
  checked: "projects.workspace.behavior.events.checked",
  unchecked: "projects.workspace.behavior.events.unchecked",
  play: "projects.workspace.behavior.events.play",
  pause: "projects.workspace.behavior.events.pause",
  ended: "projects.workspace.behavior.events.ended",
  error: "projects.workspace.behavior.events.error",
  dragStart: "projects.workspace.behavior.events.dragStart",
  dragEnd: "projects.workspace.behavior.events.dragEnd",
  tabClick: "projects.workspace.behavior.events.tabClick",
  pointClick: "projects.workspace.behavior.events.pointClick",
};

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  }
  return `${prefix}${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function getSupportedEvents(page: CanvasPage): readonly string[] {
  return getSupportedCanvasEvents(page.widget?.kind);
}

export function behaviorEventLabelKey(event: string) {
  return (
    EVENT_LABEL_KEYS[event] ?? "projects.workspace.behavior.events.custom"
  );
}

export function behaviorActionLabelKey(type: CanvasBehaviorActionType) {
  return (
    BEHAVIOR_ACTION_DEFINITIONS.find((item) => item.type === type)
      ?.labelKey ?? "projects.workspace.behavior.actions.custom"
  );
}

export function createDefaultBehavior(): CanvasBehavior {
  return {
    triggers: [],
    states: [
      {
        id: "default",
        name: "默认状态",
        initial: true,
      },
    ],
  };
}

export function getPageBehavior(page: CanvasPage): CanvasBehavior {
  return page.behavior ?? createDefaultBehavior();
}

export function createBehaviorTrigger(
  event: string,
  stateId?: string,
): CanvasBehaviorTrigger {
  return {
    id: makeId("t"),
    event,
    ...(stateId ? { stateId } : {}),
    actions: [],
  };
}

export function createBehaviorAction(
  type: CanvasBehaviorActionType,
): CanvasBehaviorAction {
  return {
    id: makeId("a"),
    type,
    ...(type === "setStyle"
      ? { key: "background-color", value: "#2f6fed" }
      : {}),
    ...(type === "setVisible" ? { value: "false" } : {}),
    ...(type === "setChecked" ? { value: "false" } : {}),
    ...(type === "setValue" ? { value: "50" } : {}),
    ...(type === "setData" ||
    type === "incrementData" ||
    type === "toggleData"
      ? { key: "", value: type === "toggleData" ? "" : "" }
      : {}),
    ...(type === "setControlState" ? { value: "" } : {}),
  };
}

export function createBehaviorState(name: string): CanvasBehaviorState {
  return {
    id: makeId("s"),
    name,
  };
}

export function createBehaviorBlock(
  type: CanvasBehaviorBlock["type"],
  x: number,
  y: number,
): CanvasBehaviorBlock {
  if (type === "event") {
    return { id: makeId("b"), type, x, y, event: "click" };
  }
  if (type === "condition") {
    return {
      id: makeId("b"),
      type,
      x,
      y,
      condition: createBehaviorCondition("nodeData"),
    };
  }
  if (type === "action") {
    return {
      id: makeId("b"),
      type,
      x,
      y,
      action: createBehaviorAction("setStyle"),
    };
  }
  return { id: makeId("b"), type: "note", x, y, text: "" };
}

export function createBehaviorEdge(
  from: string,
  to: string,
  label?: string,
): CanvasBehaviorEdge {
  return {
    id: makeId("e"),
    from,
    to,
    ...(label ? { label } : {}),
  };
}

export function getInitialBehaviorState(page: CanvasPage) {
  const behavior = getPageBehavior(page);
  return behavior.states.find((state) => state.initial)?.id ?? "default";
}

const MATERIALIZED_STATE_X = 96;
const MATERIALIZED_STATE_Y = 32;
const MATERIALIZED_STATE_GAP = 228;
const MATERIALIZED_EVENT_X = 96;
const MATERIALIZED_FLOW_Y = 164;
const MATERIALIZED_FLOW_GAP = 196;
const MATERIALIZED_ACTION_X = 404;
const MATERIALIZED_ACTION_GAP = 236;

export interface BehaviorGraphMaterialization {
  behavior: CanvasBehavior;
  changed: boolean;
  converted: boolean;
}

function cloneCondition(
  condition: CanvasBehaviorCondition,
): CanvasBehaviorCondition {
  return {
    ...condition,
    ...(condition.key !== undefined ? { key: condition.key } : {}),
    ...(condition.targetId !== undefined
      ? { targetId: condition.targetId }
      : {}),
  };
}

function cloneAction(action: CanvasBehaviorAction): CanvasBehaviorAction {
  return { ...action };
}

/**
 * Returns the v2 graph view of a behavior.
 *
 * When `blocks` is empty but legacy triggers exist, the triggers are
 * converted to a linear block chain. State nodes without coordinates get
 * deterministic positions above the event rows. The function is pure: it
 * only returns a new behavior object when something changed.
 */
export function materializeBehaviorGraph(
  behavior: CanvasBehavior,
): BehaviorGraphMaterialization {
  const hasBlocks = Boolean(behavior.blocks?.length);
  const hasGraphEdges = Boolean(behavior.edges?.length);
  const shouldConvert = !hasBlocks && behavior.triggers.length > 0;

  const nextStates = behavior.states.map((state, index) => {
    if (state.x !== undefined && state.y !== undefined) return state;
    return {
      ...state,
      x: state.x ?? MATERIALIZED_STATE_X + index * MATERIALIZED_STATE_GAP,
      y: state.y ?? MATERIALIZED_STATE_Y,
    };
  });
  const statesChanged = nextStates.some(
    (state, index) => state !== behavior.states[index],
  );

  if (!shouldConvert && (hasBlocks || hasGraphEdges)) {
    let changed = statesChanged;
    const patch: Partial<CanvasBehavior> = {};
    if (statesChanged) patch.states = nextStates;
    if (behavior.version !== 2) {
      patch.version = 2;
      patch.triggers = [];
      changed = true;
    }
    if (!behavior.edges) {
      patch.edges = [];
      changed = true;
    }
    return {
      behavior: changed ? { ...behavior, ...patch } : behavior,
      changed,
      converted: false,
    };
  }

  if (behavior.triggers.length === 0) {
    return {
      behavior: statesChanged ? { ...behavior, states: nextStates } : behavior,
      changed: statesChanged,
      converted: false,
    };
  }

  const blocks: CanvasBehaviorBlock[] = [];
  const edges: CanvasBehaviorEdge[] = [...(behavior.edges ?? [])];

  behavior.triggers.forEach((trigger, triggerIndex) => {
    const rowY = MATERIALIZED_FLOW_Y + triggerIndex * MATERIALIZED_FLOW_GAP;
    const eventBlock: CanvasBehaviorBlock = {
      id: makeId("b"),
      type: "event",
      x: MATERIALIZED_EVENT_X,
      y: rowY,
      event: trigger.event,
      ...(trigger.stateId ? { stateId: trigger.stateId } : {}),
    };
    blocks.push(eventBlock);

    let previousId = eventBlock.id;

    const conditions = trigger.conditions ?? [];
    conditions.forEach((condition, conditionIndex) => {
      const block: CanvasBehaviorBlock = {
        id: makeId("b"),
        type: "condition",
        x:
          MATERIALIZED_ACTION_X +
          conditionIndex * MATERIALIZED_ACTION_GAP,
        y: rowY,
        condition: cloneCondition(condition),
      };
      blocks.push(block);
      edges.push(createBehaviorEdge(previousId, block.id));
      previousId = block.id;
    });

    trigger.actions.forEach((action, actionIndex) => {
      const block: CanvasBehaviorBlock = {
        id: makeId("b"),
        type: "action",
        x:
          MATERIALIZED_ACTION_X +
          (conditions.length + actionIndex) * MATERIALIZED_ACTION_GAP,
        y: rowY,
        action: cloneAction(action),
      };
      blocks.push(block);
      edges.push(createBehaviorEdge(previousId, block.id));
      previousId = block.id;
    });
  });

  return {
    behavior: {
      ...behavior,
      version: 2,
      // v2 blocks are now the source of truth. Keeping legacy triggers
      // would make the runtime fall back to them when all blocks are
      // deleted, so conversion clears the legacy flow.
      triggers: [],
      states: nextStates,
      blocks,
      edges,
    },
    changed: true,
    converted: true,
  };
}

interface BehaviorLintScope {
  triggerId?: string;
  blockId?: string;
  conditionId?: string;
  actionId?: string;
}

type BehaviorIssueSink = (
  suffix: string,
  severity: BehaviorLintSeverity,
  messageKey: string,
  params?: Record<string, string | number>,
) => void;

function createIssueSink(
  issues: CanvasBehaviorLintIssue[],
  page: CanvasPage,
  idBase: string,
  scope: BehaviorLintScope,
): BehaviorIssueSink {
  return (suffix, severity, messageKey, params) => {
    issues.push({
      id: `${idBase}:${suffix}`,
      pageId: page.id,
      pageName: page.name,
      severity,
      messageKey,
      ...(params ? { params } : {}),
      ...(scope.triggerId ? { triggerId: scope.triggerId } : {}),
      ...(scope.blockId ? { blockId: scope.blockId } : {}),
      ...(scope.conditionId ? { conditionId: scope.conditionId } : {}),
      ...(scope.actionId ? { actionId: scope.actionId } : {}),
    });
  };
}

function lintCondition(
  issues: CanvasBehaviorLintIssue[],
  page: CanvasPage,
  pagesById: Map<string, CanvasPage>,
  condition: CanvasBehaviorCondition,
  scope: BehaviorLintScope,
  idBase: string,
) {
  const push = createIssueSink(issues, page, idBase, scope);

  if (condition.source === "nodeData") {
    const target = condition.targetId
      ? pagesById.get(condition.targetId)
      : page;
    if (
      !target ||
      !condition.key ||
      !target.data?.some((entry) => entry.key === condition.key)
    ) {
      push("data", "error", "projects.workspace.behavior.lint.dataMissing", {
        key: condition.key ?? "",
      });
    }
    return;
  }

  if (condition.source === "controlState") {
    const target = condition.targetId
      ? pagesById.get(condition.targetId)
      : null;
    if (!target?.controlId) {
      push(
        "control",
        "error",
        "projects.workspace.behavior.lint.controlTargetMissing",
      );
    }
    return;
  }

  if (condition.source === "state") {
    const target = condition.targetId
      ? pagesById.get(condition.targetId)
      : page;
    const targetState = target?.behavior?.states.find(
      (item) => item.id === condition.value,
    );
    if (!target || !targetState) {
      push(
        "state",
        "error",
        "projects.workspace.behavior.lint.conditionStateMissing",
        {
          state: condition.value,
          target: target?.name ?? condition.targetId ?? page.name,
        },
      );
    }
    return;
  }

  if (
    condition.source === "nodeVisible" &&
    condition.value !== "true" &&
    condition.value !== "false"
  ) {
    push(
      "visible",
      "error",
      "projects.workspace.behavior.lint.conditionValueMissing",
    );
  }

  if (
    condition.source === "nodeStyle" &&
    (!condition.key ||
      !BEHAVIOR_STYLE_KEYS.includes(
        condition.key as (typeof BEHAVIOR_STYLE_KEYS)[number],
      ))
  ) {
    push(
      "style",
      "error",
      "projects.workspace.behavior.lint.conditionStyleMissing",
    );
  }

  const targetId = condition.targetId ?? page.id;
  if (!pagesById.has(targetId)) {
    push(
      "target",
      "error",
      "projects.workspace.behavior.lint.targetMissing",
    );
    return;
  }

  if (
    (condition.operator === "gt" ||
      condition.operator === "gte" ||
      condition.operator === "lt" ||
      condition.operator === "lte") &&
    !Number.isFinite(Number.parseFloat(condition.value))
  ) {
    push(
      "operator",
      "warning",
      "projects.workspace.behavior.lint.conditionNumeric",
    );
  }
}

function lintAction(
  issues: CanvasBehaviorLintIssue[],
  page: CanvasPage,
  pagesById: Map<string, CanvasPage>,
  action: CanvasBehaviorAction,
  states: Map<string, CanvasBehaviorState>,
  scope: BehaviorLintScope,
  idBase: string,
) {
  const push = createIssueSink(issues, page, idBase, scope);

  if (action.type === "navigate") {
    if (!action.pageId || !pagesById.has(action.pageId)) {
      push(
        "page",
        "error",
        "projects.workspace.behavior.lint.pageMissing",
      );
    }
    return;
  }

  if (action.type === "setState") {
    if (!action.value || !states.has(action.value)) {
      push(
        "state",
        "error",
        "projects.workspace.behavior.lint.stateMissing",
        { state: action.value ?? "" },
      );
    }
    return;
  }

  if (
    action.type === "setData" ||
    action.type === "incrementData" ||
    action.type === "toggleData"
  ) {
    const target = action.targetId
      ? pagesById.get(action.targetId)
      : page;
    const entry = target?.data?.find((item) => item.key === action.key);
    if (!target || !action.key || !entry) {
      push("data", "error", "projects.workspace.behavior.lint.dataMissing", {
        key: action.key ?? "",
      });
    } else if (
      action.type === "incrementData" &&
      entry.type !== "number"
    ) {
      push(
        "data-type",
        "error",
        "projects.workspace.behavior.lint.dataTypeMismatch",
        { key: action.key ?? "" },
      );
    } else if (
      action.type === "toggleData" &&
      entry.type !== "boolean"
    ) {
      push(
        "data-type",
        "error",
        "projects.workspace.behavior.lint.dataTypeMismatch",
        { key: action.key ?? "" },
      );
    }
    return;
  }

  if (action.type === "setControlState") {
    const target = action.targetId
      ? pagesById.get(action.targetId)
      : null;
    if (!target?.controlId) {
      push(
        "control",
        "error",
        "projects.workspace.behavior.lint.controlTargetMissing",
      );
    }
    return;
  }

  if (!action.targetId || !pagesById.has(action.targetId)) {
    push("target", "error", "projects.workspace.behavior.lint.targetMissing");
    return;
  }

  const target = pagesById.get(action.targetId);
  if (!target) return;

  if (
    action.type === "setText" &&
    (!target.widget || !WIDGET_TEXT_KINDS.has(target.widget.kind))
  ) {
    push(
      "text",
      "error",
      "projects.workspace.behavior.lint.actionTargetUnsupported",
      { action: "setText", target: target.name },
    );
  }

  if (
    action.type === "setValue" &&
    (!target.widget || !WIDGET_VALUE_KINDS.has(target.widget.kind))
  ) {
    push(
      "value",
      "error",
      "projects.workspace.behavior.lint.actionTargetUnsupported",
      { action: "setValue", target: target.name },
    );
  }

  if (
    action.type === "setChecked" &&
    (!target.widget || !WIDGET_CHECKED_KINDS.has(target.widget.kind))
  ) {
    push(
      "checked",
      "error",
      "projects.workspace.behavior.lint.actionTargetUnsupported",
      { action: "setChecked", target: target.name },
    );
  }

  if (action.type === "setStyle" && !action.key) {
    push(
      "style",
      "error",
      "projects.workspace.behavior.lint.styleKeyMissing",
    );
  }
}

function collectStateIssues(
  issues: CanvasBehaviorLintIssue[],
  page: CanvasPage,
  behavior: CanvasBehavior,
) {
  const initialStates = behavior.states.filter((state) => state.initial);

  if (behavior.states.length > 0 && initialStates.length === 0) {
    issues.push({
      id: `${page.id}:initial-state`,
      pageId: page.id,
      pageName: page.name,
      severity: "error",
      messageKey: "projects.workspace.behavior.lint.initialStateMissing",
    });
  }

  if (initialStates.length > 1) {
    issues.push({
      id: `${page.id}:initial-state-duplicate`,
      pageId: page.id,
      pageName: page.name,
      severity: "error",
      messageKey: "projects.workspace.behavior.lint.initialStateMultiple",
    });
  }

  return initialStates;
}

function collectLegacyTriggerIssues(
  issues: CanvasBehaviorLintIssue[],
  page: CanvasPage,
  pagesById: Map<string, CanvasPage>,
  behavior: CanvasBehavior,
  supportedEvents: Set<string>,
  states: Map<string, CanvasBehaviorState>,
) {
  const triggerIds = new Set<string>();
  for (const trigger of behavior.triggers) {
    if (triggerIds.has(trigger.id)) {
      issues.push({
        id: `${page.id}:trigger-duplicate:${trigger.id}`,
        pageId: page.id,
        pageName: page.name,
        severity: "error",
        messageKey: "projects.workspace.behavior.lint.triggerDuplicate",
        params: { trigger: trigger.id },
        triggerId: trigger.id,
      });
    }
    triggerIds.add(trigger.id);

    if (!supportedEvents.has(trigger.event)) {
      issues.push({
        id: `${page.id}:event:${trigger.id}`,
        pageId: page.id,
        pageName: page.name,
        severity: "error",
        messageKey: "projects.workspace.behavior.lint.eventUnsupported",
        params: { event: trigger.event },
        triggerId: trigger.id,
      });
    }

    if (trigger.stateId && !states.has(trigger.stateId)) {
      issues.push({
        id: `${page.id}:state:${trigger.id}`,
        pageId: page.id,
        pageName: page.name,
        severity: "error",
        messageKey: "projects.workspace.behavior.lint.stateMissing",
        params: { state: trigger.stateId },
        triggerId: trigger.id,
      });
    }

    const conditionIds = new Set<string>();
    for (const condition of trigger.conditions ?? []) {
      if (conditionIds.has(condition.id)) {
        issues.push({
          id: `${page.id}:condition-duplicate:${trigger.id}:${condition.id}`,
          pageId: page.id,
          pageName: page.name,
          severity: "error",
          messageKey:
            "projects.workspace.behavior.lint.conditionDuplicate",
          triggerId: trigger.id,
          conditionId: condition.id,
        });
      }
      conditionIds.add(condition.id);

      lintCondition(
        issues,
        page,
        pagesById,
        condition,
        { triggerId: trigger.id, conditionId: condition.id },
        `${page.id}:condition:${trigger.id}:${condition.id}`,
      );
    }

    if (trigger.actions.length === 0) {
      issues.push({
        id: `${page.id}:empty:${trigger.id}`,
        pageId: page.id,
        pageName: page.name,
        severity: "warning",
        messageKey: "projects.workspace.behavior.lint.triggerEmpty",
        triggerId: trigger.id,
      });
    }

    const actionIds = new Set<string>();
    for (const action of trigger.actions) {
      if (actionIds.has(action.id)) {
        issues.push({
          id: `${page.id}:action-duplicate:${trigger.id}:${action.id}`,
          pageId: page.id,
          pageName: page.name,
          severity: "error",
          messageKey: "projects.workspace.behavior.lint.actionDuplicate",
          triggerId: trigger.id,
          actionId: action.id,
        });
      }
      actionIds.add(action.id);

      lintAction(
        issues,
        page,
        pagesById,
        action,
        states,
        { triggerId: trigger.id, actionId: action.id },
        `${page.id}:action:${trigger.id}:${action.id}`,
      );
    }
  }
}

function collectGraphIssues(
  issues: CanvasBehaviorLintIssue[],
  page: CanvasPage,
  pagesById: Map<string, CanvasPage>,
  behavior: CanvasBehavior,
  supportedEvents: Set<string>,
  states: Map<string, CanvasBehaviorState>,
  initialStates: CanvasBehaviorState[],
) {
  const blocks = behavior.blocks ?? [];
  const edges = behavior.edges ?? [];
  const blockIds = new Set(states.keys());
  const knownIds = new Set(states.keys());

  for (const [index, block] of blocks.entries()) {
    if (blockIds.has(block.id)) {
      issues.push({
        id: `${page.id}:block-duplicate:${block.id}:${index}`,
        pageId: page.id,
        pageName: page.name,
        severity: "error",
        messageKey: "projects.workspace.behavior.lint.blockDuplicate",
        params: { block: block.id },
        blockId: block.id,
      });
    }
    blockIds.add(block.id);
    knownIds.add(block.id);
  }

  const edgeIds = new Set<string>();
  const referencedStateIds = new Set(
    initialStates.map((state) => state.id),
  );
  const outgoingCount = new Map<string, number>();

  for (const [index, edge] of edges.entries()) {
    if (edgeIds.has(edge.id)) {
      issues.push({
        id: `${page.id}:edge-duplicate:${edge.id}:${index}`,
        pageId: page.id,
        pageName: page.name,
        severity: "error",
        messageKey: "projects.workspace.behavior.lint.edgeDuplicate",
        params: { edge: edge.id },
        edgeId: edge.id,
      });
    }
    edgeIds.add(edge.id);

    const fromKnown = knownIds.has(edge.from);
    const toKnown = knownIds.has(edge.to);
    if (!fromKnown || !toKnown) {
      issues.push({
        id: `${page.id}:edge-dangling:${edge.id}:${index}`,
        pageId: page.id,
        pageName: page.name,
        severity: "error",
        messageKey: "projects.workspace.behavior.lint.edgeDangling",
        params: { edge: edge.id },
        edgeId: edge.id,
      });
      continue;
    }

    outgoingCount.set(edge.from, (outgoingCount.get(edge.from) ?? 0) + 1);
    if (states.has(edge.to)) referencedStateIds.add(edge.to);
  }

  for (const block of blocks) {
    if (block.type === "event") {
      if (!block.event) {
        issues.push({
          id: `${page.id}:block-event-missing:${block.id}`,
          pageId: page.id,
          pageName: page.name,
          severity: "error",
          messageKey: "projects.workspace.behavior.lint.blockEventMissing",
          blockId: block.id,
        });
      } else if (!supportedEvents.has(block.event)) {
        issues.push({
          id: `${page.id}:block-event:${block.id}`,
          pageId: page.id,
          pageName: page.name,
          severity: "error",
          messageKey: "projects.workspace.behavior.lint.eventUnsupported",
          params: { event: block.event },
          blockId: block.id,
        });
      }

      if (block.stateId) {
        referencedStateIds.add(block.stateId);
        if (!states.has(block.stateId)) {
          issues.push({
            id: `${page.id}:block-state:${block.id}`,
            pageId: page.id,
            pageName: page.name,
            severity: "error",
            messageKey: "projects.workspace.behavior.lint.stateMissing",
            params: { state: block.stateId },
            blockId: block.id,
          });
        }
      }
    } else if (block.type === "condition") {
      if (!block.condition) {
        issues.push({
          id: `${page.id}:block-condition-missing:${block.id}`,
          pageId: page.id,
          pageName: page.name,
          severity: "error",
          messageKey:
            "projects.workspace.behavior.lint.blockConditionMissing",
          blockId: block.id,
        });
      } else {
        lintCondition(
          issues,
          page,
          pagesById,
          block.condition,
          {
            blockId: block.id,
            conditionId: block.condition.id,
          },
          `${page.id}:block-condition:${block.id}`,
        );
      }
    } else if (block.type === "action") {
      if (!block.action) {
        issues.push({
          id: `${page.id}:block-action-missing:${block.id}`,
          pageId: page.id,
          pageName: page.name,
          severity: "error",
          messageKey:
            "projects.workspace.behavior.lint.blockActionMissing",
          blockId: block.id,
        });
      } else {
        lintAction(
          issues,
          page,
          pagesById,
          block.action,
          states,
          { blockId: block.id, actionId: block.action.id },
          `${page.id}:block-action:${block.id}`,
        );

        if (block.action.type === "setState" && block.action.value) {
          referencedStateIds.add(block.action.value);
        }
      }
    }

    if (block.type === "event" || block.type === "condition") {
      if ((outgoingCount.get(block.id) ?? 0) === 0) {
        issues.push({
          id: `${page.id}:block-outgoing:${block.id}`,
          pageId: page.id,
          pageName: page.name,
          severity: "warning",
          messageKey: "projects.workspace.behavior.lint.blockNoOutgoing",
          params: { type: block.type },
          blockId: block.id,
        });
      }
    }
  }

  for (const state of behavior.states) {
    if (referencedStateIds.has(state.id)) continue;
    issues.push({
      id: `${page.id}:state-unreachable:${state.id}`,
      pageId: page.id,
      pageName: page.name,
      severity: "warning",
      messageKey: "projects.workspace.behavior.lint.stateUnreachable",
      params: { state: state.name },
      stateId: state.id,
    });
  }
}

export function collectBehaviorLint(
  pages: CanvasPage[],
): CanvasBehaviorLintIssue[] {
  const issues: CanvasBehaviorLintIssue[] = [];
  const pagesById = new Map(pages.map((page) => [page.id, page]));

  for (const page of pages) {
    if (!page.behavior) continue;
    const behavior = page.behavior;
    const supportedEvents = new Set(getSupportedEvents(page));
    const states = new Map(behavior.states.map((state) => [state.id, state]));
    const initialStates = collectStateIssues(issues, page, behavior);
    const hasGraph =
      Boolean(behavior.blocks?.length) || Boolean(behavior.edges?.length);

    if (hasGraph) {
      collectGraphIssues(
        issues,
        page,
        pagesById,
        behavior,
        supportedEvents,
        states,
        initialStates,
      );
      continue;
    }

    const referencedStateIds = new Set(
      initialStates.map((state) => state.id),
    );
    for (const trigger of behavior.triggers) {
      if (trigger.stateId) referencedStateIds.add(trigger.stateId);
      for (const action of trigger.actions) {
        if (action.type === "setState" && action.value) {
          referencedStateIds.add(action.value);
        }
      }
    }
    for (const state of behavior.states) {
      if (referencedStateIds.has(state.id)) continue;
      issues.push({
        id: `${page.id}:state-unreachable:${state.id}`,
        pageId: page.id,
        pageName: page.name,
        severity: "warning",
        messageKey: "projects.workspace.behavior.lint.stateUnreachable",
        params: { state: state.name },
        stateId: state.id,
      });
    }

    collectLegacyTriggerIssues(
      issues,
      page,
      pagesById,
      behavior,
      supportedEvents,
      states,
    );
  }

  return issues;
}
