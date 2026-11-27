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
  "setVariable",
  "incrementVariable",
  "toggleVariable",
] as const;

export const CANVAS_BEHAVIOR_STYLE_KEYS = [
  "background-color",
  "color",
  "border-color",
  "opacity",
  "border-radius",
  "display",
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
