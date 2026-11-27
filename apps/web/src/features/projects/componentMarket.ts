import type { CanvasWidgetDto } from "../../lib/api";

export type ComponentTarget = "software" | "website" | "both";
export type ContainerFrame = "iphone" | "android" | "watch";

export interface MarketContainer {
  id: string;
  type: "container";
  target: ComponentTarget;
  frame?: ContainerFrame;
  width: number;
  height: number;
  lockedSize?: boolean;
  /** Creates a control definition instead of a regular page. */
  control?: boolean;
  nameKey: string;
  descriptionKey: string;
}

export type MarketCategory =
  | "containers"
  | "actions"
  | "typography"
  | "forms"
  | "feedback"
  | "media"
  | "display";

export interface MarketWidget {
  id: string;
  type: "widget";
  target: ComponentTarget;
  category: Exclude<MarketCategory, "containers">;
  width: number;
  height: number;
  widget: CanvasWidgetDto;
  textKey?: string;
  nameKey: string;
  descriptionKey: string;
}

export type MarketItem = MarketContainer | MarketWidget;

export const MARKET_CATEGORY_ORDER: readonly MarketCategory[] = [
  "containers",
  "actions",
  "typography",
  "forms",
  "feedback",
  "media",
  "display",
];

export const MARKET_CATEGORY_LABEL_KEYS: Record<MarketCategory, string> = {
  containers: "projects.workspace.componentMarket.categories.containers",
  actions: "projects.workspace.componentMarket.categories.actions",
  typography: "projects.workspace.componentMarket.categories.typography",
  forms: "projects.workspace.componentMarket.categories.forms",
  feedback: "projects.workspace.componentMarket.categories.feedback",
  media: "projects.workspace.componentMarket.categories.media",
  display: "projects.workspace.componentMarket.categories.display",
};

export const CONTAINER_DRAG_MIME = "application/x-morfa-container";

export const CONTAINER_MARKET: readonly MarketContainer[] = [
  {
    id: "container-blank",
    type: "container",
    target: "both",
    width: 800,
    height: 800,
    nameKey: "projects.workspace.componentMarket.items.blank.name",
    descriptionKey:
      "projects.workspace.componentMarket.items.blank.description",
  },
  {
    id: "container-control",
    type: "container",
    target: "both",
    width: 240,
    height: 120,
    control: true,
    nameKey:
      "projects.workspace.componentMarket.items.controlContainer.name",
    descriptionKey:
      "projects.workspace.componentMarket.items.controlContainer.description",
  },
  {
    id: "iphone-15-pro-max",
    type: "container",
    target: "both",
    frame: "iphone",
    width: 430,
    height: 932,
    lockedSize: true,
    nameKey:
      "projects.workspace.componentMarket.items.iphone15ProMax.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.iphone",
  },
  {
    id: "iphone-15-pro",
    type: "container",
    target: "both",
    frame: "iphone",
    width: 393,
    height: 852,
    lockedSize: true,
    nameKey: "projects.workspace.componentMarket.items.iphone15Pro.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.iphone",
  },
  {
    id: "iphone-15",
    type: "container",
    target: "both",
    frame: "iphone",
    width: 390,
    height: 844,
    lockedSize: true,
    nameKey: "projects.workspace.componentMarket.items.iphone15.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.iphone",
  },
  {
    id: "iphone-15-plus",
    type: "container",
    target: "both",
    frame: "iphone",
    width: 428,
    height: 926,
    lockedSize: true,
    nameKey: "projects.workspace.componentMarket.items.iphone15Plus.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.iphone",
  },
  {
    id: "iphone-se",
    type: "container",
    target: "both",
    frame: "iphone",
    width: 375,
    height: 667,
    lockedSize: true,
    nameKey: "projects.workspace.componentMarket.items.iphoneSE.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.iphone",
  },
  {
    id: "pixel-8-pro",
    type: "container",
    target: "both",
    frame: "android",
    width: 448,
    height: 998,
    lockedSize: true,
    nameKey: "projects.workspace.componentMarket.items.pixel8Pro.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.android",
  },
  {
    id: "pixel-8",
    type: "container",
    target: "both",
    frame: "android",
    width: 412,
    height: 915,
    lockedSize: true,
    nameKey: "projects.workspace.componentMarket.items.pixel8.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.android",
  },
  {
    id: "galaxy-s24-ultra",
    type: "container",
    target: "both",
    frame: "android",
    width: 384,
    height: 854,
    lockedSize: true,
    nameKey:
      "projects.workspace.componentMarket.items.galaxyS24Ultra.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.android",
  },
  {
    id: "galaxy-s24",
    type: "container",
    target: "both",
    frame: "android",
    width: 360,
    height: 780,
    lockedSize: true,
    nameKey: "projects.workspace.componentMarket.items.galaxyS24.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.android",
  },
  {
    id: "android-standard",
    type: "container",
    target: "both",
    frame: "android",
    width: 360,
    height: 800,
    lockedSize: true,
    nameKey:
      "projects.workspace.componentMarket.items.androidStandard.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.android",
  },
  {
    id: "apple-watch-ultra",
    type: "container",
    target: "both",
    frame: "watch",
    width: 205,
    height: 251,
    lockedSize: true,
    nameKey:
      "projects.workspace.componentMarket.items.appleWatchUltra.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.watch",
  },
  {
    id: "apple-watch-45",
    type: "container",
    target: "both",
    frame: "watch",
    width: 198,
    height: 242,
    lockedSize: true,
    nameKey:
      "projects.workspace.componentMarket.items.appleWatch45.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.watch",
  },
  {
    id: "galaxy-watch",
    type: "container",
    target: "both",
    frame: "watch",
    width: 208,
    height: 218,
    lockedSize: true,
    nameKey: "projects.workspace.componentMarket.items.galaxyWatch.name",
    descriptionKey: "projects.workspace.componentMarket.descriptions.watch",
  },
];

interface MarketWidgetSeed {
  id: string;
  name: string;
  description: string;
  category: MarketWidget["category"];
  width: number;
  height: number;
  widget: CanvasWidgetDto;
  text?: string;
  target?: ComponentTarget;
}

function createMarketWidget(seed: MarketWidgetSeed): MarketWidget {
  return {
    id: seed.id,
    type: "widget",
    target: seed.target ?? "both",
    category: seed.category,
    width: seed.width,
    height: seed.height,
    widget: seed.widget,
    ...(seed.text
      ? {
          textKey: `projects.workspace.componentMarket.widgetTexts.${seed.text}`,
        }
      : {}),
    nameKey: `projects.workspace.componentMarket.items.${seed.name}.name`,
    descriptionKey: `projects.workspace.componentMarket.descriptions.${seed.description}`,
  };
}

export const WIDGET_MARKET: readonly MarketWidget[] = [
  createMarketWidget({
    id: "widget-button-primary",
    name: "buttonPrimary",
    description: "button",
    category: "actions",
    width: 176,
    height: 48,
    widget: { kind: "button", variant: "primary" },
    text: "buttonPrimary",
  }),
  createMarketWidget({
    id: "widget-button-secondary",
    name: "buttonSecondary",
    description: "button",
    category: "actions",
    width: 176,
    height: 48,
    widget: { kind: "button", variant: "secondary" },
    text: "buttonSecondary",
  }),
  createMarketWidget({
    id: "widget-button-ghost",
    name: "buttonGhost",
    description: "button",
    category: "actions",
    width: 144,
    height: 40,
    widget: { kind: "button", variant: "ghost" },
    text: "buttonGhost",
  }),
  createMarketWidget({
    id: "widget-button-icon",
    name: "buttonIcon",
    description: "buttonIcon",
    category: "actions",
    width: 48,
    height: 48,
    widget: { kind: "button", variant: "icon" },
  }),
  createMarketWidget({
    id: "widget-text-heading",
    name: "textHeading",
    description: "text",
    category: "typography",
    width: 360,
    height: 84,
    widget: { kind: "text", variant: "heading" },
    text: "textHeading",
  }),
  createMarketWidget({
    id: "widget-text-paragraph",
    name: "textParagraph",
    description: "text",
    category: "typography",
    width: 360,
    height: 108,
    widget: { kind: "text", variant: "paragraph" },
    text: "textParagraph",
  }),
  createMarketWidget({
    id: "widget-text-label",
    name: "textLabel",
    description: "textLabel",
    category: "typography",
    width: 220,
    height: 32,
    widget: { kind: "text", variant: "label" },
    text: "textLabel",
  }),
  createMarketWidget({
    id: "widget-select",
    name: "select",
    description: "select",
    category: "forms",
    width: 240,
    height: 48,
    widget: { kind: "select" },
    text: "select",
  }),
  createMarketWidget({
    id: "widget-input",
    name: "input",
    description: "input",
    category: "forms",
    width: 240,
    height: 48,
    widget: { kind: "input" },
    text: "input",
  }),
  createMarketWidget({
    id: "widget-search",
    name: "search",
    description: "search",
    category: "forms",
    width: 240,
    height: 48,
    widget: { kind: "search" },
    text: "search",
  }),
  createMarketWidget({
    id: "widget-textarea",
    name: "textarea",
    description: "textarea",
    category: "forms",
    width: 260,
    height: 132,
    widget: { kind: "textarea" },
    text: "textarea",
  }),
  createMarketWidget({
    id: "widget-checkbox",
    name: "checkbox",
    description: "checkbox",
    category: "forms",
    width: 200,
    height: 32,
    widget: { kind: "checkbox" },
    text: "checkbox",
  }),
  createMarketWidget({
    id: "widget-radio",
    name: "radio",
    description: "radio",
    category: "forms",
    width: 200,
    height: 32,
    widget: { kind: "radio" },
    text: "radio",
  }),
  createMarketWidget({
    id: "widget-toggle",
    name: "toggle",
    description: "toggle",
    category: "forms",
    width: 200,
    height: 36,
    widget: { kind: "toggle" },
    text: "toggle",
  }),
  createMarketWidget({
    id: "widget-slider",
    name: "slider",
    description: "slider",
    category: "forms",
    width: 240,
    height: 32,
    widget: { kind: "slider", value: 55 },
  }),
  createMarketWidget({
    id: "widget-progress",
    name: "progress",
    description: "progress",
    category: "feedback",
    width: 280,
    height: 52,
    widget: { kind: "progress", value: 64 },
    text: "progress",
  }),
  createMarketWidget({
    id: "widget-alert",
    name: "alert",
    description: "alert",
    category: "feedback",
    width: 320,
    height: 60,
    widget: { kind: "alert" },
    text: "alert",
  }),
  createMarketWidget({
    id: "widget-image",
    name: "image",
    description: "image",
    category: "media",
    width: 280,
    height: 180,
    widget: { kind: "image" },
  }),
  createMarketWidget({
    id: "widget-video",
    name: "video",
    description: "video",
    category: "media",
    width: 320,
    height: 180,
    widget: { kind: "video" },
    text: "video",
  }),
  createMarketWidget({
    id: "widget-avatar",
    name: "avatar",
    description: "avatar",
    category: "media",
    width: 80,
    height: 80,
    widget: { kind: "avatar" },
    text: "avatar",
  }),
  createMarketWidget({
    id: "widget-badge",
    name: "badge",
    description: "badge",
    category: "display",
    width: 100,
    height: 30,
    widget: { kind: "badge" },
    text: "badge",
  }),
  createMarketWidget({
    id: "widget-card",
    name: "card",
    description: "card",
    category: "display",
    width: 280,
    height: 200,
    widget: { kind: "card" },
    text: "card",
  }),
  createMarketWidget({
    id: "widget-tabs",
    name: "tabs",
    description: "tabs",
    category: "display",
    width: 320,
    height: 44,
    widget: { kind: "tabs" },
    text: "tabs",
  }),
  createMarketWidget({
    id: "widget-divider",
    name: "divider",
    description: "divider",
    category: "display",
    width: 280,
    height: 2,
    widget: { kind: "divider" },
  }),
  createMarketWidget({
    id: "widget-chart",
    name: "chart",
    description: "chart",
    category: "display",
    width: 320,
    height: 180,
    widget: {
      kind: "chart",
      data: [36, 62, 46, 78, 58, 88],
    },
    text: "chartTitle",
  }),
];

export const COMPONENT_MARKET: readonly MarketItem[] = [
  ...CONTAINER_MARKET,
  ...WIDGET_MARKET,
];

export function getMarketItem(id: string) {
  return COMPONENT_MARKET.find((item) => item.id === id);
}
