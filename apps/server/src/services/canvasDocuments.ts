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
  | "state"
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
}

export interface CanvasBehaviorVariableDto {
  key: string;
  type: "text" | "number" | "boolean" | "color";
  initialValue: string;
}

export interface CanvasBehaviorDto {
  triggers: CanvasBehaviorTriggerDto[];
  states: CanvasBehaviorStateDto[];
  variables: CanvasBehaviorVariableDto[];
}

export interface CanvasPageDto {
  id: string;
  name: string;
  x: number;
  y: number;
  styles: Record<string, string>;
  frame?: CanvasFrame;
  lockedSize?: boolean;
  parentId?: string;
  data?: CanvasDataEntryDto[];
  widget?: CanvasWidgetDto;
  behavior?: CanvasBehaviorDto;
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
  "setVariable",
  "incrementVariable",
  "toggleVariable",
]);

const BEHAVIOR_CONDITION_SOURCES = new Set<CanvasBehaviorConditionSource>([
  "variable",
  "state",
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

function normalizeBehavior(
  value: unknown,
): CanvasBehaviorDto | undefined {
  if (value === undefined) return undefined;
  const behavior = readObject(value);
  if (
    !Array.isArray(behavior.triggers) ||
    behavior.triggers.length > MAX_BEHAVIOR_TRIGGERS ||
    !Array.isArray(behavior.states) ||
    behavior.states.length > MAX_BEHAVIOR_STATES ||
    !Array.isArray(behavior.variables) ||
    behavior.variables.length > MAX_BEHAVIOR_VARIABLES
  ) {
    invalidDocument();
  }

  const triggers = behavior.triggers.map((rawTrigger) => {
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

    const actions: CanvasBehaviorActionDto[] = trigger.actions.map(
      (rawAction) => {
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
          typeof action.pageId === "string"
            ? action.pageId.trim()
            : "";
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
      },
    );

    let conditions: CanvasBehaviorConditionDto[] | undefined;
    if (trigger.conditions !== undefined) {
      if (
        !Array.isArray(trigger.conditions) ||
        trigger.conditions.length > MAX_BEHAVIOR_CONDITIONS
      ) {
        invalidDocument();
      }
      conditions = trigger.conditions.map((rawCondition) => {
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
            ? readString(
                condition.key,
                MAX_BEHAVIOR_VARIABLE_KEY_LENGTH,
              )
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
      });
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

  const states = behavior.states.map((rawState) => {
    const state = readObject(rawState);
    return {
      id: readString(state.id, MAX_BEHAVIOR_ID_LENGTH, true),
      name: readString(state.name, MAX_BEHAVIOR_STATE_NAME_LENGTH) ||
        "State",
      ...(state.initial === true ? { initial: true } : {}),
    };
  });

  const variables = behavior.variables.map((rawVariable) => {
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
  });

  return { triggers, states, variables };
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
  const data = normalizeData(page.data);
  const widget = normalizeWidget(page.widget);
  const behavior = normalizeBehavior(page.behavior);

  return {
    id,
    name: readString(page.name, MAX_PAGE_NAME_LENGTH) || "Page",
    x: readCoordinate(page.x),
    y: readCoordinate(page.y),
    styles: normalizeStyles(page.styles),
    ...(frame ? { frame } : {}),
    ...(lockedSize !== undefined ? { lockedSize } : {}),
    ...(parentId ? { parentId } : {}),
    ...(data.length ? { data } : {}),
    ...(widget ? { widget } : {}),
    ...(behavior ? { behavior } : {}),
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
    if (parentedPageIds.has(fromId) || parentedPageIds.has(toId)) {
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
} {
  if (!data) return { pages: [], links: [] };

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return { pages: [], links: [] };
    }
    const pages = (parsed as { pages?: unknown }).pages;
    if (!Array.isArray(pages)) return { pages: [], links: [] };
    const normalizedPages = normalizePages(pages);
    const links = normalizeLinks(
      (parsed as { links?: unknown }).links,
      normalizedPages,
    );
    return { pages: normalizedPages, links };
  } catch {
    return { pages: [], links: [] };
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
  return {
    pages: document.pages,
    links: document.links,
    updatedAt: row.updated_at,
  };
}

export function saveProjectCanvas(
  userId: string,
  projectId: string,
  rawPages: unknown,
  rawLinks: unknown,
): CanvasDocumentDto {
  const row = findProjectDataForUser(userId, projectId);
  if (!row) {
    throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
  }

  const pages = normalizePages(rawPages);
  const links = normalizeLinks(rawLinks, pages);
  const data = JSON.stringify({ version: 4, pages, links });
  if (data.length > MAX_CANVAS_JSON_LENGTH) {
    throw new ApiError(
      413,
      "CANVAS_DOCUMENT_TOO_LARGE",
      "画布数据超出限制",
    );
  }

  const updatedAt = Date.now();
  updateProjectData(projectId, data, updatedAt);

  return { pages, links, updatedAt };
}
