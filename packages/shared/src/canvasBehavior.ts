/**
 * Cross-runtime behavior catalog.
 *
 * The catalog is intentionally data-only: both the editor UI and the MCP
 * validator use the same event/action/condition vocabulary so they cannot
 * drift apart.
 */

export const CANVAS_BEHAVIOR_BASE_EVENTS = [
  "click",
  "hoverEnter",
  "hoverLeave",
] as const;

export const CANVAS_BEHAVIOR_EVENTS_BY_WIDGET: Record<
  string,
  readonly string[]
> = {
  button: [
    "click",
    "doubleClick",
    "hoverEnter",
    "hoverLeave",
    "focus",
    "blur",
  ],
  select: ["change", "open", "close", "focus", "blur", "click"],
  text: ["click", "hoverEnter", "hoverLeave"],
  input: ["input", "change", "focus", "blur", "click"],
  search: ["input", "change", "focus", "blur", "click"],
  textarea: ["input", "change", "focus", "blur", "click"],
  checkbox: ["change", "checked", "unchecked", "click"],
  radio: ["change", "checked", "unchecked", "click"],
  toggle: ["change", "checked", "unchecked", "click"],
  progress: ["click", "hoverEnter", "hoverLeave"],
  slider: ["input", "change", "dragStart", "dragEnd"],
  image: ["click", "load", "error", "hoverEnter", "hoverLeave"],
  video: ["click", "play", "pause", "ended", "load", "error"],
  avatar: ["click", "hoverEnter", "hoverLeave", "load", "error"],
  badge: ["click", "hoverEnter", "hoverLeave"],
  card: ["click", "hoverEnter", "hoverLeave", "focus", "blur"],
  tabs: ["change", "tabClick", "click"],
  alert: ["click", "close"],
  divider: ["click"],
  chart: ["click", "pointClick", "hoverEnter", "hoverLeave"],
};

export function getSupportedCanvasEvents(
  widgetKind?: string | null,
): readonly string[] {
  if (!widgetKind) {
    return ["load", ...CANVAS_BEHAVIOR_BASE_EVENTS];
  }
  return (
    CANVAS_BEHAVIOR_EVENTS_BY_WIDGET[widgetKind] ??
    CANVAS_BEHAVIOR_BASE_EVENTS
  );
}

export const CANVAS_BEHAVIOR_ACTION_TYPES = [
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
  "apply",
  "setVariable",
  "incrementVariable",
  "toggleVariable",
] as const;

const BEHAVIOR_LOCAL_KEY = /^__.+__$/;

export function isBehaviorLocalKey(key: string) {
  return BEHAVIOR_LOCAL_KEY.test(key);
}

export const CANVAS_BEHAVIOR_STYLE_KEYS = [
  "display",
  "visibility",
  "overflow",
  "opacity",
  "background-color",
  "color",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "padding",
  "margin",
  "gap",
  "font-size",
  "font-family",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "text-transform",
  "white-space",
  "text-shadow",
  "word-break",
  "text-overflow",
  "object-fit",
  "object-position",
  "flex-direction",
  "justify-content",
  "align-items",
  "flex-wrap",
  "align-self",
  "box-shadow",
  "filter",
] as const;

export const CANVAS_BEHAVIOR_CONDITION_SOURCES = [
  "variable",
  "nodeData",
  "state",
  "controlState",
  "nodeVisible",
  "nodeText",
  "nodeValue",
  "nodeStyle",
] as const;

export const CANVAS_BEHAVIOR_CONDITION_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "notContains",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;
