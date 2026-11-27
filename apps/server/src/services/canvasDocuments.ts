import { convertStoredWorldPositions } from "@morfa/shared/canvas-layout";

import {
  findProjectDataForUser,
  updateProjectData,
} from "../db/projects.js";
import { ApiError } from "../lib/errors.js";

const MAX_CANVAS_PAGES = 200;
const MAX_PAGE_STYLES = 120;
const MAX_PAGE_ID_LENGTH = 120;
const MAX_PAGE_NAME_LENGTH = 160;
const MAX_STYLE_KEY_LENGTH = 100;
const MAX_STYLE_VALUE_LENGTH = 2000;
const MAX_PAGE_DATA_ENTRIES = 100;
const MAX_DATA_KEY_LENGTH = 64;
const MAX_DATA_VALUE_LENGTH = 2000;
const MAX_DATA_COMMIT_LENGTH = 1000;
const MAX_CANVAS_LINKS = 500;
const MAX_LINK_ID_LENGTH = 120;
const MAX_LINK_COLOR_LENGTH = 64;
const MAX_LINK_WIDTH = 32;
const MAX_WIDGET_TEXT_LENGTH = 1000;
const MAX_WIDGET_VARIANT_LENGTH = 40;
const MAX_WIDGET_SRC_LENGTH = 4000;
const MAX_WIDGET_DESCRIPTION_LENGTH = 1000;
const MAX_WIDGET_OPTIONS = 20;
const MAX_WIDGET_OPTION_LENGTH = 100;
const MAX_WIDGET_DATA_POINTS = 24;
const MAX_BEHAVIOR_TRIGGERS = 100;
const MAX_BEHAVIOR_ACTIONS = 50;
const MAX_BEHAVIOR_CONDITIONS = 20;
const MAX_BEHAVIOR_STATES = 50;
const MAX_BEHAVIOR_BLOCKS = 300;
const MAX_BEHAVIOR_EDGES = 600;
const MAX_BEHAVIOR_VARIABLES = 50;
const MAX_BEHAVIOR_ID_LENGTH = 80;
const MAX_BEHAVIOR_EVENT_LENGTH = 80;
const MAX_BEHAVIOR_STATE_NAME_LENGTH = 120;
const MAX_BEHAVIOR_VARIABLE_KEY_LENGTH = 64;
const MAX_BEHAVIOR_ACTION_VALUE_LENGTH = 2000;
const MAX_CANVAS_JSON_LENGTH = 4_000_000;

export type CanvasFrame = "iphone" | "android" | "watch";
export type CanvasDataType =
  | "text"
  | "number"
  | "color"
  | "date"
  | "boolean";

export type CanvasWidgetKind =
  | "button"
  | "select"
  | "text"
  | "input"
  | "search"
  | "textarea"
  | "checkbox"
  | "radio"
  | "toggle"
  | "progress"
  | "slider"
  | "image"
  | "video"
  | "avatar"
  | "badge"
  | "card"
  | "tabs"
  | "alert"
  | "divider"
  | "chart";

export interface CanvasWidgetDto {
  kind: CanvasWidgetKind;
  variant?: string;
  text?: string;
  value?: number;
  src?: string;
  checked?: boolean;
  options?: string[];
  activeIndex?: number;
  data?: number[];
  description?: string;
  fit?: "cover" | "contain";
  showValue?: boolean;
  disabled?: boolean;
}

export interface CanvasDataEntryDto {
  key: string;
  type: CanvasDataType;
  value: string;
  commit?: string;
}

export type CanvasBehaviorActionType =
  | "navigate"
  | "setStyle"
  | "setText"
  | "setVisible"
  | "setValue"
  | "setChecked"
  | "setState"
  | "setControlState"
  | "setData"
  | "incrementData"
  | "toggleData"
  | "setVariable"
  | "incrementVariable"
  | "toggleVariable";

export interface CanvasBehaviorActionDto {
  id: string;
  type: CanvasBehaviorActionType;
  targetId?: string;
  key?: string;
  value?: string;
  pageId?: string;
}

export type CanvasBehaviorConditionSource =
  | "variable"
  | "nodeData"
  | "state"
  | "controlState"
  | "nodeVisible"
  | "nodeText"
  | "nodeValue"
  | "nodeStyle";

export type CanvasBehaviorConditionOperator =
  | "eq"
  | "neq"
  | "contains"
  | "notContains"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export interface CanvasBehaviorConditionDto {
  id: string;
  source: CanvasBehaviorConditionSource;
  key?: string;
  targetId?: string;
  operator: CanvasBehaviorConditionOperator;
  value: string;
  negate?: boolean;
}

export interface CanvasBehaviorTriggerDto {
  id: string;
  event: string;
  stateId?: string;
  conditionMode?: "all" | "any";
  conditions?: CanvasBehaviorConditionDto[];
  actions: CanvasBehaviorActionDto[];
}

export interface CanvasBehaviorStateDto {
  id: string;
  name: string;
  initial?: boolean;
  x?: number;
  y?: number;
}

export type CanvasBehaviorBlockType =
  | "event"
  | "condition"
  | "action"
  | "note"
  | "reference"
  | "switch"
  | "function"
  | "call";

export interface CanvasBehaviorBlockDto {
  id: string;
  type: CanvasBehaviorBlockType;
  x: number;
  y: number;
  event?: string;
  stateId?: string;
  condition?: CanvasBehaviorConditionDto;
  conditions?: CanvasBehaviorConditionDto[];
  conditionMode?: "all" | "any";
  action?: CanvasBehaviorActionDto;
  text?: string;
  /** Canvas page represented by a reference block, event, or switch. */
  nodeId?: string;
  /** CamelCase property id read by a switch block. */
  key?: string;
  /** Switch case values. Output port `case:n` follows `cases[n]`. */
  cases?: string[];
}

export interface CanvasBehaviorEdgeDto {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface CanvasBehaviorVariableDto {
  key: string;
  type: "text" | "number" | "boolean" | "color";
  initialValue: string;
}

export interface CanvasBehaviorDto {
  version?: 2;
  triggers: CanvasBehaviorTriggerDto[];
  states: CanvasBehaviorStateDto[];
  blocks?: CanvasBehaviorBlockDto[];
  edges?: CanvasBehaviorEdgeDto[];
  /** Legacy v1; migrated to node data during normalization. */
  variables?: CanvasBehaviorVariableDto[];
}

export type CanvasNodeKind =
  | "page"
  | "control"
  | "control-state"
  | "control-instance";

export interface CanvasControlMetaDto {
  status: "draft" | "compiled";
  defaultStateId: string;
  description?: string;
  target?: "software" | "website" | "both";
  compiledAt?: number;
  compiledRevision?: number;
  compiledSig?: string;
}

export interface CanvasPageDto {
  id: string;
  name: string;
  x: number;
  y: number;
  styles: Record<string, string>;
  nodeKind?: CanvasNodeKind;
  frame?: CanvasFrame;
  lockedSize?: boolean;
  parentId?: string;
  data?: CanvasDataEntryDto[];
  widget?: CanvasWidgetDto;
  behavior?: CanvasBehaviorDto;
  control?: CanvasControlMetaDto;
  controlId?: string;
  controlStateId?: string;
}

export type CanvasLinkDirection = "one-way" | "two-way";
export type CanvasLinkEdge = "top" | "right" | "bottom" | "left";

export interface CanvasLinkAnchorDto {
  x: number;
  y: number;
  edge: CanvasLinkEdge;
}

export interface CanvasLinkDto {
  id: string;
  fromId: string;
  toId: string;
  direction: CanvasLinkDirection;
  color: string;
  width: number;
  dashed: boolean;
  fromAnchor: CanvasLinkAnchorDto;
  toAnchor: CanvasLinkAnchorDto;
  createdAt: number;
}

export interface CanvasDocumentDto {
  pages: CanvasPageDto[];
  links: CanvasLinkDto[];
  behavior?: CanvasBehaviorDto;
  updatedAt: number;
}

function invalidDocument(): never {
  throw new ApiError(
    400,
    "CANVAS_DOCUMENT_INVALID",
    "画布数据格式不正确",
  );
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidDocument();
  }
  return value as Record<string, unknown>;
}

function readString(
  value: unknown,
  maxLength: number,
  required = false,
): string {
  if (typeof value !== "string") invalidDocument();
  const text = value.trim();
  if (required && !text) invalidDocument();
  if (text.length > maxLength) invalidDocument();
  return text;
}

function readCoordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalidDocument();
  }
  return value;
}

function normalizeStyles(value: unknown): Record<string, string> {
  const styles = readObject(value);
  const entries = Object.entries(styles);
  if (entries.length > MAX_PAGE_STYLES) invalidDocument();

  const normalized: Record<string, string> = {};
  for (const [key, styleValue] of entries) {
    if (typeof key !== "string" || typeof styleValue !== "string") {
      invalidDocument();
    }
    const name = key.trim();
    if (!name || name.length > MAX_STYLE_KEY_LENGTH) invalidDocument();
    if (styleValue.length > MAX_STYLE_VALUE_LENGTH) invalidDocument();
    normalized[name] = styleValue;
  }

  return normalized;
}

function readPageId(value: unknown) {
  const id = readString(value, MAX_PAGE_ID_LENGTH, true);
  if (
    !/^[A-Za-z0-9_-]+$/.test(id) ||
    id.toLowerCase() === "self"
  ) {
    invalidDocument();
  }
  return id;
}

function normalizeData(value: unknown): CanvasDataEntryDto[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidDocument();
  if (value.length > MAX_PAGE_DATA_ENTRIES) invalidDocument();

  const entries: CanvasDataEntryDto[] = [];
  const keys = new Set<string>();

  for (const rawEntry of value) {
    const entry = readObject(rawEntry);
    const key = readString(entry.key, MAX_DATA_KEY_LENGTH, true);
    if (keys.has(key)) invalidDocument();
    keys.add(key);

    const type = entry.type;
    if (
      type !== "text" &&
      type !== "number" &&
      type !== "color" &&
      type !== "date" &&
      type !== "boolean"
    ) {
      invalidDocument();
    }

    const entryValue = typeof entry.value === "string" ? entry.value : "";
    if (entryValue.length > MAX_DATA_VALUE_LENGTH) invalidDocument();

    const commit =
      typeof entry.commit === "string" ? entry.commit.trim() : "";
    if (commit.length > MAX_DATA_COMMIT_LENGTH) invalidDocument();

    entries.push({
      key,
      type,
      value: entryValue,
      ...(commit ? { commit } : {}),
    });
  }

  return entries;
}

const CANVAS_WIDGET_KINDS = new Set<CanvasWidgetKind>([
  "button",
  "select",
  "text",
  "input",
  "search",
  "textarea",
  "checkbox",
  "radio",
  "toggle",
  "progress",
  "slider",
  "image",
  "video",
  "avatar",
  "badge",
  "card",
  "tabs",
  "alert",
  "divider",
  "chart",
]);

function normalizeWidget(value: unknown): CanvasWidgetDto | undefined {
  if (value === undefined) return undefined;

  const widget = readObject(value);
  const kind = widget.kind;
  if (
    typeof kind !== "string" ||
    !CANVAS_WIDGET_KINDS.has(kind as CanvasWidgetKind)
  ) {
    invalidDocument();
  }

  const variant =
    typeof widget.variant === "string" ? widget.variant.trim() : "";
  if (variant.length > MAX_WIDGET_VARIANT_LENGTH) invalidDocument();

  const text = typeof widget.text === "string" ? widget.text : "";
  if (text.length > MAX_WIDGET_TEXT_LENGTH) invalidDocument();

  const src = typeof widget.src === "string" ? widget.src.trim() : "";
  if (src.length > MAX_WIDGET_SRC_LENGTH) invalidDocument();

  const description =
    typeof widget.description === "string" ? widget.description : "";
  if (description.length > MAX_WIDGET_DESCRIPTION_LENGTH) {
    invalidDocument();
  }

  let normalizedValue: number | undefined;
  if (widget.value !== undefined) {
    if (
      typeof widget.value !== "number" ||
      !Number.isFinite(widget.value)
    ) {
      invalidDocument();
    }
    normalizedValue = Math.min(100, Math.max(0, widget.value));
  }

  let options: string[] | undefined;
  if (widget.options !== undefined) {
    if (
      !Array.isArray(widget.options) ||
      widget.options.length > MAX_WIDGET_OPTIONS
    ) {
      invalidDocument();
    }
    options = [];
    for (const rawOption of widget.options) {
      if (typeof rawOption !== "string") invalidDocument();
      const option = rawOption.trim();
      if (option.length > MAX_WIDGET_OPTION_LENGTH) invalidDocument();
      if (option) options.push(option);
    }
  }

  let activeIndex: number | undefined;
  if (widget.activeIndex !== undefined) {
    if (
      typeof widget.activeIndex !== "number" ||
      !Number.isFinite(widget.activeIndex)
    ) {
      invalidDocument();
    }
    activeIndex = Math.max(0, Math.floor(widget.activeIndex));
  }

  let chartData: number[] | undefined;
  if (widget.data !== undefined) {
    if (
      !Array.isArray(widget.data) ||
      widget.data.length > MAX_WIDGET_DATA_POINTS
    ) {
      invalidDocument();
    }
    chartData = widget.data.map((point) => {
      if (typeof point !== "number" || !Number.isFinite(point)) {
        invalidDocument();
      }
      return Math.min(100, Math.max(0, point));
    });
  }

  const checked =
    typeof widget.checked === "boolean" ? widget.checked : undefined;
  const showValue =
    typeof widget.showValue === "boolean" ? widget.showValue : undefined;
  const disabled =
    typeof widget.disabled === "boolean" ? widget.disabled : undefined;
  const fit =
    widget.fit === "cover" || widget.fit === "contain"
      ? widget.fit
      : undefined;

  return {
    kind: kind as CanvasWidgetKind,
    ...(variant ? { variant } : {}),
    ...(text ? { text } : {}),
    ...(normalizedValue !== undefined
      ? { value: normalizedValue }
      : {}),
    ...(src ? { src } : {}),
    ...(checked !== undefined ? { checked } : {}),
    ...(options && options.length ? { options } : {}),
    ...(activeIndex !== undefined ? { activeIndex } : {}),
    ...(chartData && chartData.length ? { data: chartData } : {}),
    ...(description ? { description } : {}),
    ...(fit ? { fit } : {}),
    ...(showValue !== undefined ? { showValue } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
  };
}

const BEHAVIOR_ACTION_TYPES = new Set<CanvasBehaviorActionType>([
  "navigate",
  "setStyle",
  "setText",
  "setVisible",
  "setValue",
  "setChecked",
  "setState",
  "setControlState",
  "setData",
  "incrementData",
  "toggleData",
  "setVariable",
  "incrementVariable",
  "toggleVariable",
]);

const BEHAVIOR_CONDITION_SOURCES = new Set<CanvasBehaviorConditionSource>([
  "variable",
  "nodeData",
  "state",
  "controlState",
  "nodeVisible",
  "nodeText",
  "nodeValue",
  "nodeStyle",
]);

const BEHAVIOR_CONDITION_OPERATORS =
  new Set<CanvasBehaviorConditionOperator>([
    "eq",
    "neq",
    "contains",
    "notContains",
    "gt",
    "gte",
    "lt",
    "lte",
  ]);

const BEHAVIOR_BLOCK_TYPES = new Set<CanvasBehaviorBlockType>([
  "event",
  "condition",
  "action",
  "note",
  "reference",
  "switch",
  "function",
  "call",
]);

function normalizeBehaviorAction(
  rawAction: unknown,
): CanvasBehaviorActionDto {
  const action = readObject(rawAction);
  const actionId = readString(
    action.id,
    MAX_BEHAVIOR_ID_LENGTH,
    true,
  );
  const type = action.type;
  if (
    typeof type !== "string" ||
    !BEHAVIOR_ACTION_TYPES.has(type as CanvasBehaviorActionType)
  ) {
    invalidDocument();
  }

  const targetIdValue =
    typeof action.targetId === "string"
      ? action.targetId.trim()
      : "";
  const targetId = targetIdValue
    ? readPageId(targetIdValue)
    : undefined;
  const pageIdValue =
    typeof action.pageId === "string" ? action.pageId.trim() : "";
  const pageId = pageIdValue ? readPageId(pageIdValue) : undefined;
  const key =
    typeof action.key === "string"
      ? readString(action.key, MAX_STYLE_KEY_LENGTH)
      : "";
  const actionValue =
    typeof action.value === "string" ? action.value : "";
  if (actionValue.length > MAX_BEHAVIOR_ACTION_VALUE_LENGTH) {
    invalidDocument();
  }

  return {
    id: actionId,
    type: type as CanvasBehaviorActionType,
    ...(targetId ? { targetId } : {}),
    ...(key ? { key } : {}),
    ...(actionValue ? { value: actionValue } : {}),
    ...(pageId ? { pageId } : {}),
  };
}

function normalizeBehaviorCondition(
  rawCondition: unknown,
): CanvasBehaviorConditionDto {
  const condition = readObject(rawCondition);
  const conditionId = readString(
    condition.id,
    MAX_BEHAVIOR_ID_LENGTH,
    true,
  );
  const source = condition.source;
  if (
    typeof source !== "string" ||
    !BEHAVIOR_CONDITION_SOURCES.has(
      source as CanvasBehaviorConditionSource,
    )
  ) {
    invalidDocument();
  }
  const operator = condition.operator;
  if (
    typeof operator !== "string" ||
    !BEHAVIOR_CONDITION_OPERATORS.has(
      operator as CanvasBehaviorConditionOperator,
    )
  ) {
    invalidDocument();
  }
  const key =
    typeof condition.key === "string"
      ? readString(condition.key, MAX_BEHAVIOR_VARIABLE_KEY_LENGTH)
      : "";
  const targetIdValue =
    typeof condition.targetId === "string"
      ? condition.targetId.trim()
      : "";
  const targetId = targetIdValue
    ? readPageId(targetIdValue)
    : undefined;
  const conditionValue =
    typeof condition.value === "string" ? condition.value : "";
  if (conditionValue.length > MAX_BEHAVIOR_ACTION_VALUE_LENGTH) {
    invalidDocument();
  }
  return {
    id: conditionId,
    source: source as CanvasBehaviorConditionSource,
    ...(key ? { key } : {}),
    ...(targetId ? { targetId } : {}),
    operator: operator as CanvasBehaviorConditionOperator,
    value: conditionValue,
    ...(condition.negate === true ? { negate: true } : {}),
  };
}

function normalizeBehaviorBlock(
  rawBlock: unknown,
): CanvasBehaviorBlockDto {
  const block = readObject(rawBlock);
  const id = readString(block.id, MAX_BEHAVIOR_ID_LENGTH, true);
  const type = block.type;
  if (
    typeof type !== "string" ||
    !BEHAVIOR_BLOCK_TYPES.has(type as CanvasBehaviorBlockType)
  ) {
    invalidDocument();
  }
  const x = readCoordinate(block.x);
  const y = readCoordinate(block.y);
  const stateIdValue =
    typeof block.stateId === "string" ? block.stateId.trim() : "";
  const stateId = stateIdValue
    ? readString(stateIdValue, MAX_BEHAVIOR_ID_LENGTH, true)
    : "";
  const textValue =
    typeof block.text === "string" ? block.text.trim() : "";
  if (textValue.length > 2000) invalidDocument();

  if (type === "event") {
    const nodeIdValue =
      typeof block.nodeId === "string" ? block.nodeId.trim() : "";
    return {
      id,
      type: "event",
      x,
      y,
      event: readString(
        block.event,
        MAX_BEHAVIOR_EVENT_LENGTH,
        true,
      ),
      ...(stateId ? { stateId } : {}),
      ...(nodeIdValue ? { nodeId: readPageId(nodeIdValue) } : {}),
    };
  }
  if (type === "condition") {
    const conditions =
      block.conditions === undefined
        ? undefined
        : Array.isArray(block.conditions) &&
            block.conditions.length <= MAX_BEHAVIOR_CONDITIONS
          ? block.conditions.map(normalizeBehaviorCondition)
          : invalidDocument();
    const condition =
      block.condition === undefined
        ? undefined
        : normalizeBehaviorCondition(block.condition);
    if (!condition && (!conditions || conditions.length === 0)) {
      invalidDocument();
    }
    return {
      id,
      type: "condition",
      x,
      y,
      ...(condition ? { condition } : {}),
      ...(conditions?.length
        ? {
            conditionMode:
              block.conditionMode === "any" ? "any" : "all",
            conditions,
          }
        : {}),
    };
  }
  if (type === "action") {
    return {
      id,
      type: "action",
      x,
      y,
      action: normalizeBehaviorAction(block.action),
    };
  }
  if (type === "switch") {
    const nodeIdValue =
      typeof block.nodeId === "string" ? block.nodeId.trim() : "";
    const keyValue =
      typeof block.key === "string" ? block.key.trim() : "";
    if (keyValue.length > 120) invalidDocument();
    const cases =
      block.cases === undefined
        ? []
        : Array.isArray(block.cases) && block.cases.length <= 24
          ? block.cases.map((item) => {
              if (typeof item !== "string") invalidDocument();
              const value = item.trim();
              if (value.length > 200) invalidDocument();
              return value;
            })
          : invalidDocument();
    return {
      id,
      type: "switch",
      x,
      y,
      ...(nodeIdValue ? { nodeId: readPageId(nodeIdValue) } : {}),
      ...(keyValue ? { key: keyValue } : {}),
      ...(cases.length ? { cases } : {}),
    };
  }
  if (type === "function") {
    return {
      id,
      type: "function",
      x,
      y,
      ...(textValue ? { text: textValue } : {}),
    };
  }
  if (type === "call") {
    const keyValue =
      typeof block.key === "string" ? block.key.trim() : "";
    if (keyValue.length > MAX_BEHAVIOR_ID_LENGTH) invalidDocument();
    return {
      id,
      type: "call",
      x,
      y,
      ...(keyValue ? { key: keyValue } : {}),
    };
  }
  if (type === "reference") {
    const nodeIdValue =
      typeof block.nodeId === "string" ? block.nodeId.trim() : "";
    if (!nodeIdValue) invalidDocument();
    return {
      id,
      type: "reference",
      x,
      y,
      nodeId: readPageId(nodeIdValue),
    };
  }
  return {
    id,
    type: "note",
    x,
    y,
    ...(textValue ? { text: textValue } : {}),
  };
}

function normalizeBehavior(
  value: unknown,
): CanvasBehaviorDto | undefined {
  if (value === undefined) return undefined;
  const behavior = readObject(value);
  const rawTriggers = behavior.triggers ?? [];
  const rawStates = behavior.states;
  const rawVariables = behavior.variables;
  if (
    !Array.isArray(rawTriggers) ||
    rawTriggers.length > MAX_BEHAVIOR_TRIGGERS ||
    !Array.isArray(rawStates) ||
    rawStates.length > MAX_BEHAVIOR_STATES ||
    (rawVariables !== undefined && !Array.isArray(rawVariables)) ||
    (Array.isArray(rawVariables) &&
      rawVariables.length > MAX_BEHAVIOR_VARIABLES)
  ) {
    invalidDocument();
  }

  const triggers = rawTriggers.map((rawTrigger) => {
    const trigger = readObject(rawTrigger);
    const id = readString(trigger.id, MAX_BEHAVIOR_ID_LENGTH, true);
    const event = readString(
      trigger.event,
      MAX_BEHAVIOR_EVENT_LENGTH,
      true,
    );
    const stateIdValue =
      typeof trigger.stateId === "string"
        ? trigger.stateId.trim()
        : "";
    const stateId = stateIdValue
      ? readString(stateIdValue, MAX_BEHAVIOR_ID_LENGTH, true)
      : "";
    if (
      !Array.isArray(trigger.actions) ||
      trigger.actions.length > MAX_BEHAVIOR_ACTIONS
    ) {
      invalidDocument();
    }
    const actions = trigger.actions.map(normalizeBehaviorAction);

    let conditions: CanvasBehaviorConditionDto[] | undefined;
    if (trigger.conditions !== undefined) {
      if (
        !Array.isArray(trigger.conditions) ||
        trigger.conditions.length > MAX_BEHAVIOR_CONDITIONS
      ) {
        invalidDocument();
      }
      conditions = trigger.conditions.map(normalizeBehaviorCondition);
    }

    const conditionMode: CanvasBehaviorTriggerDto["conditionMode"] =
      trigger.conditionMode === "any" ? "any" : "all";

    return {
      id,
      event,
      ...(stateId ? { stateId } : {}),
      ...(conditions?.length
        ? { conditionMode, conditions }
        : {}),
      actions,
    };
  });

  const states = rawStates.map((rawState) => {
    const state = readObject(rawState);
    const x =
      state.x === undefined ? undefined : readCoordinate(state.x);
    const y =
      state.y === undefined ? undefined : readCoordinate(state.y);
    return {
      id: readString(state.id, MAX_BEHAVIOR_ID_LENGTH, true),
      name:
        readString(state.name, MAX_BEHAVIOR_STATE_NAME_LENGTH) ||
        "State",
      ...(state.initial === true ? { initial: true } : {}),
      ...(x !== undefined ? { x } : {}),
      ...(y !== undefined ? { y } : {}),
    };
  });

  const stateIds = new Set(states.map((state) => state.id));
  if (stateIds.size !== states.length) invalidDocument();

  let blocks: CanvasBehaviorBlockDto[] | undefined;
  if (behavior.blocks !== undefined) {
    if (
      !Array.isArray(behavior.blocks) ||
      behavior.blocks.length > MAX_BEHAVIOR_BLOCKS
    ) {
      invalidDocument();
    }
    blocks = behavior.blocks.map(normalizeBehaviorBlock);
    const ids = new Set(stateIds);
    for (const block of blocks) {
      if (ids.has(block.id)) invalidDocument();
      ids.add(block.id);
    }
  }

  let edges: CanvasBehaviorEdgeDto[] | undefined;
  if (behavior.edges !== undefined) {
    if (
      !Array.isArray(behavior.edges) ||
      behavior.edges.length > MAX_BEHAVIOR_EDGES
    ) {
      invalidDocument();
    }
    const knownIds = new Set(stateIds);
    for (const block of blocks ?? []) knownIds.add(block.id);
    const edgeIds = new Set<string>();
    edges = behavior.edges.map((rawEdge) => {
      const edge = readObject(rawEdge);
      const id = readString(edge.id, MAX_BEHAVIOR_ID_LENGTH, true);
      const from = readString(edge.from, MAX_BEHAVIOR_ID_LENGTH, true);
      const to = readString(edge.to, MAX_BEHAVIOR_ID_LENGTH, true);
      if (edgeIds.has(id) || !knownIds.has(from) || !knownIds.has(to)) {
        invalidDocument();
      }
      edgeIds.add(id);
      const labelValue =
        typeof edge.label === "string" ? edge.label.trim() : "";
      if (labelValue.length > 160) invalidDocument();
      return {
        id,
        from,
        to,
        ...(labelValue ? { label: labelValue } : {}),
      };
    });
  }

  const variables = Array.isArray(rawVariables)
    ? rawVariables.map((rawVariable) => {
        const variable = readObject(rawVariable);
        const type = variable.type;
        if (
          type !== "text" &&
          type !== "number" &&
          type !== "boolean" &&
          type !== "color"
        ) {
          invalidDocument();
        }
        const initialValue =
          typeof variable.initialValue === "string"
            ? variable.initialValue
            : "";
        if (initialValue.length > MAX_BEHAVIOR_ACTION_VALUE_LENGTH) {
          invalidDocument();
        }
        return {
          key: readString(
            variable.key,
            MAX_BEHAVIOR_VARIABLE_KEY_LENGTH,
            true,
          ),
          type: type as CanvasBehaviorVariableDto["type"],
          initialValue,
        };
      })
    : undefined;

  return {
    ...(blocks || edges ? { version: 2 as const } : {}),
    triggers,
    states,
    ...(blocks ? { blocks } : {}),
    ...(edges ? { edges } : {}),
    ...(variables?.length ? { variables } : {}),
  };
}

function rewriteLegacyBehavior(
  pageId: string,
  behavior: CanvasBehaviorDto,
): { behavior: CanvasBehaviorDto; dataEntries: CanvasDataEntryDto[] } {
  const variables = behavior.variables ?? [];
  if (variables.length === 0) {
    if (behavior.variables) delete behavior.variables;
    return { behavior, dataEntries: [] };
  }

  const keyMap = new Map<string, string>();
  const dataEntries: CanvasDataEntryDto[] = [];
  for (const variable of variables) {
    if (keyMap.has(variable.key)) continue;
    keyMap.set(variable.key, variable.key);
    dataEntries.push({
      key: variable.key,
      type: variable.type,
      value: variable.initialValue,
    });
  }

  const rewriteCondition = (
    condition: CanvasBehaviorConditionDto,
  ): CanvasBehaviorConditionDto => {
    if (condition.source !== "variable") return condition;
    const key = condition.key ? keyMap.get(condition.key) ?? condition.key : "";
    return {
      ...condition,
      source: "nodeData",
      ...(key ? { key } : {}),
      targetId: pageId,
    };
  };

  const rewriteAction = (
    action: CanvasBehaviorActionDto,
  ): CanvasBehaviorActionDto => {
    if (
      action.type !== "setVariable" &&
      action.type !== "incrementVariable" &&
      action.type !== "toggleVariable"
    ) {
      return action;
    }
    const type =
      action.type === "setVariable"
        ? "setData"
        : action.type === "incrementVariable"
          ? "incrementData"
          : "toggleData";
    const key = action.key ? keyMap.get(action.key) ?? action.key : "";
    return {
      ...action,
      type,
      ...(key ? { key } : {}),
      targetId: pageId,
    };
  };

  behavior.triggers = behavior.triggers.map((trigger) => ({
    ...trigger,
    ...(trigger.conditions?.length
      ? { conditions: trigger.conditions.map(rewriteCondition) }
      : {}),
    actions: trigger.actions.map(rewriteAction),
  }));
  behavior.blocks = behavior.blocks?.map((block) => ({
    ...block,
    ...(block.condition
      ? { condition: rewriteCondition(block.condition) }
      : {}),
    ...(block.conditions?.length
      ? { conditions: block.conditions.map(rewriteCondition) }
      : {}),
    ...(block.action ? { action: rewriteAction(block.action) } : {}),
  }));
  delete behavior.variables;
  behavior.version = 2;
  return { behavior, dataEntries };
}

function normalizePage(value: unknown): CanvasPageDto {
  const page = readObject(value);
  const frame =
    page.frame === "iphone" ||
    page.frame === "android" ||
    page.frame === "watch"
      ? page.frame
      : undefined;
  const lockedSize =
    typeof page.lockedSize === "boolean" ? page.lockedSize : undefined;
  const parentIdValue =
    typeof page.parentId === "string" ? page.parentId.trim() : "";
  const parentId = parentIdValue
    ? readPageId(parentIdValue)
    : undefined;
  const id = readPageId(page.id);
  if (parentId === id) invalidDocument();
  let data = normalizeData(page.data);
  const widget = normalizeWidget(page.widget);
  let behavior = normalizeBehavior(page.behavior);

  if (behavior) {
    const migrated = rewriteLegacyBehavior(id, behavior);
    behavior = migrated.behavior;
    if (migrated.dataEntries.length > 0) {
      const existingKeys = new Set(data.map((entry) => entry.key));
      for (const entry of migrated.dataEntries) {
        if (existingKeys.has(entry.key)) continue;
        data.push(entry);
        existingKeys.add(entry.key);
      }
      if (data.length > MAX_PAGE_DATA_ENTRIES) invalidDocument();
    }
  }

  const nodeKind =
    page.nodeKind === "control" ||
    page.nodeKind === "control-state" ||
    page.nodeKind === "control-instance" ||
    page.nodeKind === "page"
      ? page.nodeKind
      : undefined;
  const controlIdValue =
    typeof page.controlId === "string" ? page.controlId.trim() : "";
  const controlId = controlIdValue ? readPageId(controlIdValue) : undefined;
  const controlStateIdValue =
    typeof page.controlStateId === "string"
      ? page.controlStateId.trim()
      : "";
  const controlStateId = controlStateIdValue
    ? readPageId(controlStateIdValue)
    : undefined;
  let control: CanvasControlMetaDto | undefined;
  if (page.control !== undefined) {
    const rawControl = readObject(page.control);
    if (nodeKind !== "control") invalidDocument();
    const status =
      rawControl.status === "compiled" ? "compiled" : "draft";
    const defaultStateId = readPageId(rawControl.defaultStateId);
    const description =
      typeof rawControl.description === "string"
        ? rawControl.description.trim()
        : "";
    if (description.length > 500) invalidDocument();
    const target =
      rawControl.target === "website" ||
      rawControl.target === "both" ||
      rawControl.target === "software"
        ? rawControl.target
        : undefined;
    const compiledAt =
      typeof rawControl.compiledAt === "number" &&
      Number.isFinite(rawControl.compiledAt)
        ? rawControl.compiledAt
        : undefined;
    const compiledRevision =
      typeof rawControl.compiledRevision === "number" &&
      Number.isFinite(rawControl.compiledRevision)
        ? rawControl.compiledRevision
        : undefined;
    const compiledSig =
      typeof rawControl.compiledSig === "string"
        ? rawControl.compiledSig
        : "";
    if (compiledSig.length > 500_000) invalidDocument();
    control = {
      status,
      defaultStateId,
      ...(description ? { description } : {}),
      ...(target ? { target } : {}),
      ...(compiledAt !== undefined ? { compiledAt } : {}),
      ...(compiledRevision !== undefined ? { compiledRevision } : {}),
      ...(compiledSig ? { compiledSig } : {}),
    };
  }

  return {
    id,
    name: readString(page.name, MAX_PAGE_NAME_LENGTH) || "Page",
    x: readCoordinate(page.x),
    y: readCoordinate(page.y),
    styles: normalizeStyles(page.styles),
    ...(nodeKind && nodeKind !== "page" ? { nodeKind } : {}),
    ...(frame ? { frame } : {}),
    ...(lockedSize !== undefined ? { lockedSize } : {}),
    ...(parentId ? { parentId } : {}),
    ...(data.length ? { data } : {}),
    ...(widget ? { widget } : {}),
    ...(behavior ? { behavior } : {}),
    ...(control ? { control } : {}),
    ...(controlId ? { controlId } : {}),
    ...(controlStateId ? { controlStateId } : {}),
  };
}

function normalizePages(value: unknown): CanvasPageDto[] {
  if (!Array.isArray(value)) invalidDocument();
  if (value.length > MAX_CANVAS_PAGES) {
    throw new ApiError(
      413,
      "CANVAS_DOCUMENT_TOO_LARGE",
      "页面数量超出限制",
    );
  }

  const pages = value.map(normalizePage);
  if (new Set(pages.map((page) => page.id)).size !== pages.length) {
    invalidDocument();
  }

  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const controls = pages.filter((page) => page.nodeKind === "control");
  const controlIds = new Set(controls.map((page) => page.id));
  const statePages = pages.filter(
    (page) => page.nodeKind === "control-state",
  );
  const stateIdsByControl = new Map<string, Set<string>>();

  for (const control of controls) {
    if (control.parentId) invalidDocument();
    if (!control.control) invalidDocument();
    const states = statePages.filter(
      (page) => page.controlId === control.id,
    );
    if (states.length === 0) invalidDocument();
    const stateIds = new Set(states.map((page) => page.id));
    if (!control.control?.defaultStateId ||
        !stateIds.has(control.control.defaultStateId)) {
      invalidDocument();
    }
    stateIdsByControl.set(control.id, stateIds);
  }

  const childrenByParent = new Map<string, CanvasPageDto[]>();
  for (const page of pages) {
    if (!page.parentId) continue;
    const list = childrenByParent.get(page.parentId);
    if (list) list.push(page);
    else childrenByParent.set(page.parentId, [page]);
  }

  const collectStateDependencies = (stateId: string) => {
    const dependencies = new Set<string>();
    const stack = [stateId];
    const visited = new Set<string>();
    while (stack.length) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      for (const child of childrenByParent.get(current) ?? []) {
        if (child.nodeKind === "control-instance" && child.controlId) {
          dependencies.add(child.controlId);
        }
        stack.push(child.id);
      }
    }
    return dependencies;
  };

  const controlDependencies = new Map<string, Set<string>>();
  for (const control of controls) {
    const dependencies = new Set<string>();
    for (const stateId of stateIdsByControl.get(control.id) ?? []) {
      for (const dependency of collectStateDependencies(stateId)) {
        dependencies.add(dependency);
      }
    }
    controlDependencies.set(control.id, dependencies);
  }

  for (const control of controls) {
    const stack = [...(controlDependencies.get(control.id) ?? [])];
    const visited = new Set<string>();
    while (stack.length) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      if (current === control.id) invalidDocument();
      visited.add(current);
      stack.push(...(controlDependencies.get(current) ?? []));
    }
  }

  for (const page of pages) {
    if (page.parentId) {
      const parent = pagesById.get(page.parentId);
      if (
        parent?.nodeKind === "control" ||
        parent?.nodeKind === "control-instance"
      ) {
        invalidDocument();
      }
    }
    if (page.nodeKind === "control-state") {
      if (!page.controlId || !controlIds.has(page.controlId)) {
        invalidDocument();
      }
      if (page.parentId) invalidDocument();
    }
    if (page.nodeKind === "control-instance") {
      if (!page.controlId || !controlIds.has(page.controlId)) {
        invalidDocument();
      }
      const stateIds = stateIdsByControl.get(page.controlId);
      if (
        page.controlStateId &&
        !stateIds?.has(page.controlStateId)
      ) {
        invalidDocument();
      }
    }
    if (
      page.nodeKind !== "control" &&
      page.nodeKind !== "control-state" &&
      page.nodeKind !== "control-instance" &&
      page.controlId
    ) {
      invalidDocument();
    }
    if (
      page.nodeKind !== "control-instance" &&
      page.controlStateId
    ) {
      invalidDocument();
    }
    if (
      page.nodeKind !== "control" &&
      page.control !== undefined
    ) {
      invalidDocument();
    }
  }

  return pages;
}

function normalizeAnchor(value: unknown): CanvasLinkAnchorDto {
  const anchor = readObject(value);
  const x = readCoordinate(anchor.x);
  const y = readCoordinate(anchor.y);
  if (x < 0 || x > 1 || y < 0 || y > 1) invalidDocument();

  const edge = anchor.edge;
  if (
    edge !== "top" &&
    edge !== "right" &&
    edge !== "bottom" &&
    edge !== "left"
  ) {
    invalidDocument();
  }

  return { x, y, edge };
}

function normalizeLinks(
  value: unknown,
  pages: CanvasPageDto[],
): CanvasLinkDto[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidDocument();
  if (value.length > MAX_CANVAS_LINKS) {
    throw new ApiError(
      413,
      "CANVAS_DOCUMENT_TOO_LARGE",
      "关联线数量超出限制",
    );
  }

  const pageIds = new Set(pages.map((page) => page.id));
  const parentedPageIds = new Set(
    pages.filter((page) => page.parentId).map((page) => page.id),
  );
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const isHidden = (page: CanvasPageDto) => {
    const visited = new Set<string>();
    let current: CanvasPageDto | undefined = page;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (
        current.nodeKind === "control" ||
        current.nodeKind === "control-state" ||
        current.nodeKind === "control-instance"
      ) {
        return true;
      }
      current = current.parentId
        ? pagesById.get(current.parentId)
        : undefined;
    }
    return false;
  };
  const hiddenPageIds = new Set(
    pages.filter(isHidden).map((page) => page.id),
  );
  const linkIds = new Set<string>();
  const links: CanvasLinkDto[] = [];

  for (const rawLink of value) {
    const link = readObject(rawLink);
    const id = readString(link.id, MAX_LINK_ID_LENGTH, true);
    if (linkIds.has(id)) invalidDocument();
    linkIds.add(id);

    const fromId = readPageId(link.fromId);
    const toId = readPageId(link.toId);
    if (fromId === toId) invalidDocument();
    if (!pageIds.has(fromId) || !pageIds.has(toId)) {
      invalidDocument();
    }

    // 子节点禁止关联线，加载旧数据时直接忽略这类关联。
    if (
      parentedPageIds.has(fromId) ||
      parentedPageIds.has(toId) ||
      hiddenPageIds.has(fromId) ||
      hiddenPageIds.has(toId)
    ) {
      continue;
    }

    const direction = link.direction;
    if (direction !== "one-way" && direction !== "two-way") {
      invalidDocument();
    }

    const color = readString(link.color, MAX_LINK_COLOR_LENGTH, true);
    const widthValue =
      typeof link.width === "number" && Number.isFinite(link.width)
        ? link.width
        : 2;
    if (widthValue < 1 || widthValue > MAX_LINK_WIDTH) {
      invalidDocument();
    }
    const dashed = Boolean(link.dashed);
    const createdAt =
      typeof link.createdAt === "number" &&
      Number.isFinite(link.createdAt)
        ? link.createdAt
        : 0;

    links.push({
      id,
      fromId,
      toId,
      direction,
      color,
      width: widthValue,
      dashed,
      fromAnchor: normalizeAnchor(link.fromAnchor),
      toAnchor: normalizeAnchor(link.toAnchor),
      createdAt,
    });
  }

  return links;
}

function parseStoredDocument(data: string): {
  pages: CanvasPageDto[];
  links: CanvasLinkDto[];
  behavior?: CanvasBehaviorDto;
  migrated: boolean;
} {
  if (!data) return { pages: [], links: [], migrated: false };

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { pages: [], links: [], migrated: false };
    }
    const record = parsed as {
      version?: unknown;
      pages?: unknown;
      links?: unknown;
      behavior?: unknown;
    };
    const pages = record.pages;
    if (!Array.isArray(pages)) {
      return { pages: [], links: [], migrated: false };
    }
    const normalizedPages = normalizePages(pages);
    const version = typeof record.version === "number" ? record.version : 1;
    const migrated = version < 5;
    if (migrated) convertStoredWorldPositions(normalizedPages);
    const links = normalizeLinks(record.links, normalizedPages);
    const rawBehavior = record.behavior;
    const behavior =
      rawBehavior === undefined
        ? undefined
        : normalizeBehavior(rawBehavior);
    return {
      pages: normalizedPages,
      links,
      migrated,
      ...(behavior ? { behavior } : {}),
    };
  } catch {
    return { pages: [], links: [], migrated: false };
  }
}

export function getProjectCanvas(
  userId: string,
  projectId: string,
): CanvasDocumentDto {
  const row = findProjectDataForUser(userId, projectId);
  if (!row) {
    throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
  }

  const document = parseStoredDocument(row.data);
  let updatedAt = row.updated_at;
  if (document.migrated) {
    updatedAt = Date.now();
    updateProjectData(
      projectId,
      JSON.stringify({
        version: 5,
        pages: document.pages,
        links: document.links,
        ...(document.behavior ? { behavior: document.behavior } : {}),
      }),
      updatedAt,
    );
  }
  return {
    pages: document.pages,
    links: document.links,
    ...(document.behavior ? { behavior: document.behavior } : {}),
    updatedAt,
  };
}

export function saveProjectCanvas(
  userId: string,
  projectId: string,
  rawPages: unknown,
  rawLinks: unknown,
  rawBehavior?: unknown,
): CanvasDocumentDto {
  const row = findProjectDataForUser(userId, projectId);
  if (!row) {
    throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
  }

  const pages = normalizePages(rawPages);
  const links = normalizeLinks(rawLinks, pages);
  const behavior =
    rawBehavior === undefined
      ? parseStoredDocument(row.data).behavior
      : rawBehavior === null
        ? undefined
        : normalizeBehavior(rawBehavior);
  const data = JSON.stringify({
    version: 5,
    pages,
    links,
    ...(behavior ? { behavior } : {}),
  });
  if (data.length > MAX_CANVAS_JSON_LENGTH) {
    throw new ApiError(
      413,
      "CANVAS_DOCUMENT_TOO_LARGE",
      "画布数据超出限制",
    );
  }

  const updatedAt = Date.now();
  updateProjectData(projectId, data, updatedAt);

  return {
    pages,
    links,
    ...(behavior ? { behavior } : {}),
    updatedAt,
  };
}
