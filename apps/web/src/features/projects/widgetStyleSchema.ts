import type { CanvasWidgetKind } from "./canvasDocument";

export type WidgetStyleFieldControl = "color" | "text" | "select";

export interface WidgetStyleField {
  key: string;
  labelKey: string;
  control: WidgetStyleFieldControl;
  placeholder?: string;
  options?: readonly string[];
}

const FIELD = "projects.workspace.propertiesPanel.componentFields.";

const FIELD_FIELDS: WidgetStyleField[] = [
  {
    key: "--mf-widget-field-placeholder",
    labelKey: `${FIELD}fieldPlaceholder`,
    control: "color",
  },
  {
    key: "--mf-widget-field-caret",
    labelKey: `${FIELD}fieldCaret`,
    control: "color",
  },
  {
    key: "--mf-widget-field-padding",
    labelKey: `${FIELD}fieldPadding`,
    control: "text",
    placeholder: "0 7%",
  },
  {
    key: "--mf-widget-field-shadow",
    labelKey: `${FIELD}fieldShadow`,
    control: "text",
    placeholder: "0 1px 2px rgba(0,0,0,.06)",
  },
];

const CHOICE_FIELDS: WidgetStyleField[] = [
  {
    key: "--mf-widget-choice-checked-bg",
    labelKey: `${FIELD}choiceCheckedBg`,
    control: "color",
  },
  {
    key: "--mf-widget-choice-checked-color",
    labelKey: `${FIELD}choiceCheckedColor`,
    control: "color",
  },
  {
    key: "--mf-widget-choice-unchecked-bg",
    labelKey: `${FIELD}choiceUncheckedBg`,
    control: "color",
  },
  {
    key: "--mf-widget-choice-unchecked-border",
    labelKey: `${FIELD}choiceUncheckedBorder`,
    control: "color",
  },
  {
    key: "--mf-widget-choice-size",
    labelKey: `${FIELD}choiceSize`,
    control: "text",
    placeholder: "22px",
  },
];

const SCHEMAS: Partial<Record<CanvasWidgetKind, WidgetStyleField[]>> = {
  button: [
    {
      key: "--mf-widget-button-padding",
      labelKey: `${FIELD}buttonPadding`,
      control: "text",
      placeholder: "0 8%",
    },
    {
      key: "--mf-widget-button-shadow",
      labelKey: `${FIELD}buttonShadow`,
      control: "text",
      placeholder: "0 4px 12px rgba(0,0,0,.2)",
    },
    {
      key: "--mf-widget-button-border-width",
      labelKey: `${FIELD}buttonBorderWidth`,
      control: "text",
      placeholder: "1px",
    },
    {
      key: "--mf-widget-button-border-style",
      labelKey: `${FIELD}buttonBorderStyle`,
      control: "select",
      options: ["none", "solid", "dashed", "dotted"],
    },
  ],
  select: FIELD_FIELDS,
  input: FIELD_FIELDS,
  search: FIELD_FIELDS,
  textarea: FIELD_FIELDS,
  checkbox: CHOICE_FIELDS,
  radio: CHOICE_FIELDS,
  toggle: [
    {
      key: "--mf-widget-toggle-on",
      labelKey: `${FIELD}toggleOn`,
      control: "color",
    },
    {
      key: "--mf-widget-toggle-off",
      labelKey: `${FIELD}toggleOff`,
      control: "color",
    },
    {
      key: "--mf-widget-toggle-thumb",
      labelKey: `${FIELD}toggleThumb`,
      control: "color",
    },
    {
      key: "--mf-widget-toggle-radius",
      labelKey: `${FIELD}toggleRadius`,
      control: "text",
      placeholder: "999px",
    },
  ],
  progress: [
    {
      key: "--mf-widget-progress-track",
      labelKey: `${FIELD}progressTrack`,
      control: "color",
    },
    {
      key: "--mf-widget-progress-fill",
      labelKey: `${FIELD}progressFill`,
      control: "text",
      placeholder: "#2f6fed",
    },
    {
      key: "--mf-widget-progress-height",
      labelKey: `${FIELD}progressHeight`,
      control: "text",
      placeholder: "8px",
    },
  ],
  slider: [
    {
      key: "--mf-widget-slider-track",
      labelKey: `${FIELD}sliderTrack`,
      control: "color",
    },
    {
      key: "--mf-widget-slider-fill",
      labelKey: `${FIELD}sliderFill`,
      control: "text",
      placeholder: "#2f6fed",
    },
    {
      key: "--mf-widget-slider-thumb",
      labelKey: `${FIELD}sliderThumb`,
      control: "color",
    },
    {
      key: "--mf-widget-slider-thumb-border",
      labelKey: `${FIELD}sliderThumbBorder`,
      control: "color",
    },
    {
      key: "--mf-widget-slider-height",
      labelKey: `${FIELD}sliderHeight`,
      control: "text",
      placeholder: "8px",
    },
  ],
  image: [
    {
      key: "object-position",
      labelKey: `${FIELD}objectPosition`,
      control: "text",
      placeholder: "center center",
    },
  ],
  video: [
    {
      key: "object-position",
      labelKey: `${FIELD}objectPosition`,
      control: "text",
      placeholder: "center center",
    },
    {
      key: "--mf-widget-video-overlay",
      labelKey: `${FIELD}videoOverlay`,
      control: "text",
      placeholder: "linear-gradient(transparent, rgba(0,0,0,.45))",
    },
    {
      key: "--mf-widget-video-play-bg",
      labelKey: `${FIELD}videoPlayBg`,
      control: "color",
    },
    {
      key: "--mf-widget-video-play-color",
      labelKey: `${FIELD}videoPlayColor`,
      control: "color",
    },
  ],
  avatar: [
    {
      key: "--mf-widget-avatar-bg",
      labelKey: `${FIELD}avatarBackground`,
      control: "text",
      placeholder: "linear-gradient(145deg, #5d8bff, #2f6fed)",
    },
    {
      key: "--mf-widget-avatar-color",
      labelKey: `${FIELD}avatarColor`,
      control: "color",
    },
  ],
  badge: [
    {
      key: "--mf-widget-badge-bg",
      labelKey: `${FIELD}badgeBackground`,
      control: "color",
    },
    {
      key: "--mf-widget-badge-color",
      labelKey: `${FIELD}badgeColor`,
      control: "color",
    },
  ],
  card: [
    {
      key: "--mf-widget-card-media",
      labelKey: `${FIELD}cardMedia`,
      control: "text",
      placeholder: "linear-gradient(135deg, #7ba1ff, #365fd4)",
    },
    {
      key: "--mf-widget-card-title",
      labelKey: `${FIELD}cardTitle`,
      control: "color",
    },
    {
      key: "--mf-widget-card-description",
      labelKey: `${FIELD}cardDescription`,
      control: "color",
    },
    {
      key: "--mf-widget-card-shadow",
      labelKey: `${FIELD}cardShadow`,
      control: "text",
      placeholder: "0 6px 18px rgba(0,0,0,.12)",
    },
  ],
  tabs: [
    {
      key: "--mf-widget-tab-bg",
      labelKey: `${FIELD}tabBackground`,
      control: "color",
    },
    {
      key: "--mf-widget-tab-inactive",
      labelKey: `${FIELD}tabInactive`,
      control: "color",
    },
    {
      key: "--mf-widget-tab-active",
      labelKey: `${FIELD}tabActive`,
      control: "color",
    },
    {
      key: "--mf-widget-tab-indicator",
      labelKey: `${FIELD}tabIndicator`,
      control: "color",
    },
  ],
  alert: [
    {
      key: "--mf-widget-alert-icon",
      labelKey: `${FIELD}alertIcon`,
      control: "color",
    },
    {
      key: "--mf-widget-alert-bg",
      labelKey: `${FIELD}alertBackground`,
      control: "color",
    },
    {
      key: "--mf-widget-alert-border",
      labelKey: `${FIELD}alertBorder`,
      control: "color",
    },
  ],
  divider: [
    {
      key: "--mf-widget-divider-color",
      labelKey: `${FIELD}dividerColor`,
      control: "color",
    },
    {
      key: "--mf-widget-divider-size",
      labelKey: `${FIELD}dividerSize`,
      control: "text",
      placeholder: "2px",
    },
  ],
  chart: [
    {
      key: "--mf-widget-chart-grid",
      labelKey: `${FIELD}chartGrid`,
      control: "color",
    },
    {
      key: "--mf-widget-chart-bar",
      labelKey: `${FIELD}chartBar`,
      control: "text",
      placeholder: "linear-gradient(180deg, #7ba1ff, #2f6fed)",
    },
    {
      key: "--mf-widget-chart-bar-alt",
      labelKey: `${FIELD}chartBarAlt`,
      control: "text",
      placeholder: "linear-gradient(180deg, #b8ccff, #6d92f5)",
    },
    {
      key: "--mf-widget-chart-title",
      labelKey: `${FIELD}chartTitle`,
      control: "color",
    },
  ],
};

export function getWidgetStyleFields(
  kind: CanvasWidgetKind | undefined,
): WidgetStyleField[] {
  if (!kind) return [];
  return SCHEMAS[kind] ?? [];
}
