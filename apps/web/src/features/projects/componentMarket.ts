export type ComponentTarget = "software" | "website" | "both";

export interface MarketContainer {
  id: string;
  type: "container";
  target: ComponentTarget;
  nameKey: string;
  descriptionKey: string;
}

export const CONTAINER_DRAG_MIME = "application/x-morfa-container";

export const CONTAINER_MARKET: readonly MarketContainer[] = [
  {
    id: "container-blank",
    type: "container",
    target: "both",
    nameKey: "projects.workspace.componentMarket.items.blank.name",
    descriptionKey: "projects.workspace.componentMarket.items.blank.description",
  },
  {
    id: "container-app",
    type: "container",
    target: "both",
    nameKey: "projects.workspace.componentMarket.items.app.name",
    descriptionKey: "projects.workspace.componentMarket.items.app.description",
  },
  {
    id: "container-list",
    type: "container",
    target: "both",
    nameKey: "projects.workspace.componentMarket.items.list.name",
    descriptionKey: "projects.workspace.componentMarket.items.list.description",
  },
  {
    id: "container-detail",
    type: "container",
    target: "both",
    nameKey: "projects.workspace.componentMarket.items.detail.name",
    descriptionKey: "projects.workspace.componentMarket.items.detail.description",
  },
  {
    id: "container-form",
    type: "container",
    target: "both",
    nameKey: "projects.workspace.componentMarket.items.form.name",
    descriptionKey: "projects.workspace.componentMarket.items.form.description",
  },
  {
    id: "container-web",
    type: "container",
    target: "both",
    nameKey: "projects.workspace.componentMarket.items.web.name",
    descriptionKey: "projects.workspace.componentMarket.items.web.description",
  },
];

export function getMarketContainer(id: string) {
  return CONTAINER_MARKET.find((item) => item.id === id);
}
