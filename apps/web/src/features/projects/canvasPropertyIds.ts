import { CANVAS_BEHAVIOR_STYLE_KEYS } from "@morfa/shared/canvas-behavior";

import { collectWidgetStyleKeys } from "./widgetStyleSchema";

export type BehaviorPropertyKind =
  | "text"
  | "value"
  | "visible"
  | "checked"
  | "controlState"
  | "data"
  | "style"
  | "attribute";

export interface BehaviorPropertyField {
  kind: BehaviorPropertyKind;
  key?: string;
}

const BUILTIN_IDS = new Set([
  "text",
  "value",
  "visible",
  "checked",
  "controlState",
]);

/** Widget fields addressed by the id shown in the properties tab. */
export const BEHAVIOR_ATTRIBUTE_IDS = [
  "src",
  "description",
  "variant",
  "options",
  "fit",
  "disabled",
  "showValue",
  "activeIndex",
  "chartData",
] as const;

const ATTRIBUTE_IDS = new Set<string>(BEHAVIOR_ATTRIBUTE_IDS);

const LAYOUT_STYLE_KEYS = new Set([
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "left",
  "top",
  "right",
  "bottom",
  "position",
  "z-index",
  "transform",
  "aspect-ratio",
]);

const STYLE_KEYS = [
  ...CANVAS_BEHAVIOR_STYLE_KEYS,
  ...LAYOUT_STYLE_KEYS,
];

export function cssKeyToFieldId(key: string) {
  const body = key.startsWith("--mf-widget-")
    ? key.slice("--mf-widget-".length)
    : key.startsWith("--mf-")
      ? key.slice("--mf-".length)
      : key;
  return body.replace(/-([a-zA-Z0-9])/g, (_, char: string) =>
    char.toUpperCase(),
  );
}

const STYLE_ID_TO_KEY = new Map<string, string>();
for (const key of STYLE_KEYS) {
  STYLE_ID_TO_KEY.set(cssKeyToFieldId(key), key);
  STYLE_ID_TO_KEY.set(key, key);
}

const WIDGET_ID_TO_KEY = new Map<string, string>();
for (const key of collectWidgetStyleKeys()) {
  WIDGET_ID_TO_KEY.set(cssKeyToFieldId(key), key);
  WIDGET_ID_TO_KEY.set(key, key);
}

export function isAttributeId(id: string | undefined) {
  return Boolean(id && ATTRIBUTE_IDS.has(id));
}

export function dataBehaviorId(key: string) {
  const camel = cssKeyToFieldId(key);
  if (
    BUILTIN_IDS.has(camel) ||
    ATTRIBUTE_IDS.has(camel) ||
    STYLE_ID_TO_KEY.has(camel)
  ) {
    return `data.${key}`;
  }
  return camel;
}

export function propertyFieldId(field: BehaviorPropertyField) {
  if (field.kind === "data") return dataBehaviorId(field.key ?? "");
  if (field.kind === "style") return cssKeyToFieldId(field.key ?? "");
  if (field.kind === "attribute") return field.key ?? "";
  return field.kind;
}

function matchDataKey(id: string, dataKeys: Iterable<string>) {
  for (const key of dataKeys) {
    if (!key) continue;
    if (key === id || dataBehaviorId(key) === id || cssKeyToFieldId(key) === id) {
      return key;
    }
  }
  return undefined;
}

/**
 * Resolve the camelCase id typed into a modify or judge block.
 * `data.` forces a node-data key when it collides with a style id.
 */
export function resolvePropertyId(
  raw: string,
  dataKeys: Iterable<string>,
): BehaviorPropertyField | null {
  const id = raw.trim();
  if (!id) return null;
  if (id.startsWith("data.")) {
    const key = id.slice(5).trim();
    return key ? { kind: "data", key } : null;
  }
  if (BUILTIN_IDS.has(id)) return { kind: id as BehaviorPropertyField["kind"] };
  if (ATTRIBUTE_IDS.has(id)) return { kind: "attribute", key: id };
  const styleKey = STYLE_ID_TO_KEY.get(id);
  if (styleKey && !LAYOUT_STYLE_KEYS.has(styleKey)) {
    return { kind: "style", key: styleKey };
  }
  const widgetKey = WIDGET_ID_TO_KEY.get(id);
  if (widgetKey && !LAYOUT_STYLE_KEYS.has(widgetKey)) {
    return { kind: "style", key: widgetKey };
  }
  const dataKey = matchDataKey(id, dataKeys);
  if (dataKey) return { kind: "data", key: dataKey };
  if (styleKey) return { kind: "style", key: styleKey };
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) return { kind: "data", key: id };
  if (id.includes("-") && !LAYOUT_STYLE_KEYS.has(id)) {
    return { kind: "style", key: id };
  }
  return null;
}
