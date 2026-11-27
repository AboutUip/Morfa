import { getSupportedCanvasEvents } from "@morfa/shared/canvas-behavior";

import type {
  CanvasBehavior,
  CanvasBehaviorAction,
  CanvasBehaviorActionType,
  CanvasBehaviorCondition,
  CanvasBehaviorConditionOperator,
  CanvasBehaviorConditionSource,
  CanvasBehaviorState,
  CanvasBehaviorTrigger,
  CanvasBehaviorVariable,
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
      type: "setVariable",
      labelKey: "projects.workspace.behavior.actions.setVariable",
      needsTarget: false,
      needsValue: true,
    },
    {
      type: "incrementVariable",
      labelKey: "projects.workspace.behavior.actions.incrementVariable",
      needsTarget: false,
      needsValue: true,
    },
    {
      type: "toggleVariable",
      labelKey: "projects.workspace.behavior.actions.toggleVariable",
      needsTarget: false,
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
      source: "variable",
      labelKey: "projects.workspace.behavior.conditions.sources.variable",
      needsKey: true,
      needsTarget: false,
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
  source: CanvasBehaviorConditionSource = "variable",
): CanvasBehaviorCondition {
  return {
    id: makeId("c"),
    source,
    ...(source === "variable" || source === "nodeStyle"
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
    variables: [],
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
  };
}

export function createBehaviorState(name: string): CanvasBehaviorState {
  return {
    id: makeId("s"),
    name,
  };
}

export function createBehaviorVariable(
  key: string,
): CanvasBehaviorVariable {
  return {
    key,
    type: "text",
    initialValue: "",
  };
}

export function getInitialBehaviorState(page: CanvasPage) {
  const behavior = getPageBehavior(page);
  return behavior.states.find((state) => state.initial)?.id ?? "default";
}

export function collectBehaviorLint(
  pages: CanvasPage[],
): CanvasBehaviorLintIssue[] {
  const issues: CanvasBehaviorLintIssue[] = [];
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const allVariables = new Map<string, CanvasBehaviorVariable>();
  for (const page of pages) {
    for (const variable of page.behavior?.variables ?? []) {
      if (!allVariables.has(variable.key)) {
        allVariables.set(variable.key, variable);
      }
    }
  }

  for (const page of pages) {
    if (!page.behavior) continue;
    const behavior = page.behavior;
    const supportedEvents = new Set(getSupportedEvents(page));
    const states = new Map(behavior.states.map((state) => [state.id, state]));
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

    for (const variable of behavior.variables) {
      if (
        behavior.variables.filter((item) => item.key === variable.key)
          .length > 1
      ) {
        issues.push({
          id: `${page.id}:variable:${variable.key}`,
          pageId: page.id,
          pageName: page.name,
          severity: "error",
          messageKey: "projects.workspace.behavior.lint.variableDuplicate",
          params: { key: variable.key },
        });
      }
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
      });
    }

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
      const conditions = trigger.conditions ?? [];
      for (const condition of conditions) {
        if (conditionIds.has(condition.id)) {
          issues.push({
            id: `${page.id}:condition-duplicate:${condition.id}`,
            pageId: page.id,
            pageName: page.name,
            severity: "error",
            messageKey:
              "projects.workspace.behavior.lint.conditionDuplicate",
            triggerId: trigger.id,
          });
        }
        conditionIds.add(condition.id);

        if (
          condition.source === "variable" &&
          (!condition.key || !allVariables.has(condition.key))
        ) {
          issues.push({
            id: `${page.id}:condition-variable:${condition.id}`,
            pageId: page.id,
            pageName: page.name,
            severity: "error",
            messageKey:
              "projects.workspace.behavior.lint.variableMissing",
            params: { key: condition.key ?? "" },
            triggerId: trigger.id,
          });
          continue;
        }

        if (condition.source === "state") {
          const target = condition.targetId
            ? pagesById.get(condition.targetId)
            : page;
          const targetState = target?.behavior?.states.find(
            (item) => item.id === condition.value,
          );
          if (!target || !targetState) {
            issues.push({
              id: `${page.id}:condition-state:${condition.id}`,
              pageId: page.id,
              pageName: page.name,
              severity: "error",
              messageKey:
                "projects.workspace.behavior.lint.conditionStateMissing",
              params: {
                state: condition.value,
                target: target?.name ?? condition.targetId ?? page.name,
              },
              triggerId: trigger.id,
            });
          }
          continue;
        }

        if (condition.source === "nodeVisible") {
          if (condition.value !== "true" && condition.value !== "false") {
            issues.push({
              id: `${page.id}:condition-visible:${condition.id}`,
              pageId: page.id,
              pageName: page.name,
              severity: "error",
              messageKey:
                "projects.workspace.behavior.lint.conditionValueMissing",
              triggerId: trigger.id,
            });
          }
        }

        if (
          condition.source === "nodeStyle" &&
          (!condition.key ||
            !BEHAVIOR_STYLE_KEYS.includes(
              condition.key as (typeof BEHAVIOR_STYLE_KEYS)[number],
            ))
        ) {
          issues.push({
            id: `${page.id}:condition-style:${condition.id}`,
            pageId: page.id,
            pageName: page.name,
            severity: "error",
            messageKey:
              "projects.workspace.behavior.lint.conditionStyleMissing",
            triggerId: trigger.id,
          });
        }

        const targetId = condition.targetId ?? page.id;
        if (!pagesById.has(targetId)) {
          issues.push({
            id: `${page.id}:condition-target:${condition.id}`,
            pageId: page.id,
            pageName: page.name,
            severity: "error",
            messageKey:
              "projects.workspace.behavior.lint.targetMissing",
            triggerId: trigger.id,
          });
          continue;
        }

        if (
          (condition.operator === "gt" ||
            condition.operator === "gte" ||
            condition.operator === "lt" ||
            condition.operator === "lte") &&
          !Number.isFinite(Number.parseFloat(condition.value))
        ) {
          issues.push({
            id: `${page.id}:condition-operator:${condition.id}`,
            pageId: page.id,
            pageName: page.name,
            severity: "warning",
            messageKey:
              "projects.workspace.behavior.lint.conditionNumeric",
            triggerId: trigger.id,
          });
        }
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
            id: `${page.id}:action-duplicate:${action.id}`,
            pageId: page.id,
            pageName: page.name,
            severity: "error",
            messageKey: "projects.workspace.behavior.lint.actionDuplicate",
            triggerId: trigger.id,
            actionId: action.id,
          });
        }
        actionIds.add(action.id);

        if (action.type === "navigate") {
          if (!action.pageId || !pagesById.has(action.pageId)) {
            issues.push({
              id: `${page.id}:action-page:${action.id}`,
              pageId: page.id,
              pageName: page.name,
              severity: "error",
              messageKey: "projects.workspace.behavior.lint.pageMissing",
              triggerId: trigger.id,
              actionId: action.id,
            });
          }
          continue;
        }

        if (action.type === "setState") {
          if (!action.value || !states.has(action.value)) {
            issues.push({
              id: `${page.id}:action-state:${action.id}`,
              pageId: page.id,
              pageName: page.name,
              severity: "error",
              messageKey: "projects.workspace.behavior.lint.stateMissing",
              params: { state: action.value ?? "" },
              triggerId: trigger.id,
              actionId: action.id,
            });
          }
          continue;
        }

        if (
          action.type === "setVariable" ||
          action.type === "incrementVariable" ||
          action.type === "toggleVariable"
        ) {
          if (!action.key || !allVariables.has(action.key)) {
            issues.push({
              id: `${page.id}:action-variable:${action.id}`,
              pageId: page.id,
              pageName: page.name,
              severity: "error",
              messageKey:
                "projects.workspace.behavior.lint.variableMissing",
              params: { key: action.key ?? "" },
              triggerId: trigger.id,
              actionId: action.id,
            });
          }
          continue;
        }

        if (!action.targetId || !pagesById.has(action.targetId)) {
          issues.push({
            id: `${page.id}:action-target:${action.id}`,
            pageId: page.id,
            pageName: page.name,
            severity: "error",
            messageKey: "projects.workspace.behavior.lint.targetMissing",
            triggerId: trigger.id,
            actionId: action.id,
          });
          continue;
        }

        const target = pagesById.get(action.targetId);
        if (!target) continue;

        if (action.type === "setText") {
          if (!target.widget || !WIDGET_TEXT_KINDS.has(target.widget.kind)) {
            issues.push({
              id: `${page.id}:action-text:${action.id}`,
              pageId: page.id,
              pageName: page.name,
              severity: "error",
              messageKey: "projects.workspace.behavior.lint.actionTargetUnsupported",
              params: { action: "setText", target: target.name },
              triggerId: trigger.id,
              actionId: action.id,
            });
          }
        }

        if (action.type === "setValue") {
          if (!target.widget || !WIDGET_VALUE_KINDS.has(target.widget.kind)) {
            issues.push({
              id: `${page.id}:action-value:${action.id}`,
              pageId: page.id,
              pageName: page.name,
              severity: "error",
              messageKey: "projects.workspace.behavior.lint.actionTargetUnsupported",
              params: { action: "setValue", target: target.name },
              triggerId: trigger.id,
              actionId: action.id,
            });
          }
        }

        if (action.type === "setChecked") {
          if (
            !target.widget ||
            !WIDGET_CHECKED_KINDS.has(target.widget.kind)
          ) {
            issues.push({
              id: `${page.id}:action-checked:${action.id}`,
              pageId: page.id,
              pageName: page.name,
              severity: "error",
              messageKey: "projects.workspace.behavior.lint.actionTargetUnsupported",
              params: { action: "setChecked", target: target.name },
              triggerId: trigger.id,
              actionId: action.id,
            });
          }
        }

        if (action.type === "setStyle" && !action.key) {
          issues.push({
            id: `${page.id}:action-style:${action.id}`,
            pageId: page.id,
            pageName: page.name,
            severity: "error",
            messageKey: "projects.workspace.behavior.lint.styleKeyMissing",
            triggerId: trigger.id,
            actionId: action.id,
          });
        }
      }
    }
  }

  return issues;
}
