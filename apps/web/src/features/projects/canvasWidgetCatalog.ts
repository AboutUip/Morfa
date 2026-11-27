import type { CanvasWidgetKind } from "./canvasDocument";

export const WIDGET_TEXT_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
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
  "image",
  "video",
  "avatar",
  "badge",
  "card",
  "tabs",
  "alert",
  "chart",
]);

export const WIDGET_VALUE_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "progress",
  "slider",
]);

export const WIDGET_SOURCE_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "image",
  "video",
  "avatar",
  "card",
]);

export const WIDGET_DESCRIPTION_KINDS: ReadonlySet<CanvasWidgetKind> =
  new Set(["card", "chart"]);

export const WIDGET_CHECKED_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "checkbox",
  "radio",
  "toggle",
]);

export const WIDGET_OPTIONS_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "select",
]);

export const WIDGET_ACTIVE_INDEX_KINDS: ReadonlySet<CanvasWidgetKind> =
  new Set(["select", "tabs"]);

export const WIDGET_DATA_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "chart",
]);

export const WIDGET_FIT_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "image",
  "video",
]);

export const WIDGET_SHOW_VALUE_KINDS: ReadonlySet<CanvasWidgetKind> =
  new Set(["progress"]);

export const WIDGET_DISABLED_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "button",
]);

export const WIDGET_VARIANT_OPTIONS: Partial<
  Record<CanvasWidgetKind, readonly string[]>
> = {
  button: ["primary", "secondary", "ghost", "icon"],
  text: ["heading", "paragraph", "label"],
  badge: ["accent", "success", "warning", "danger"],
  alert: ["info", "success", "warning", "error"],
  chart: ["bar", "line"],
};
