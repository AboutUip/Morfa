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
];

export function getMarketContainer(id: string) {
  return CONTAINER_MARKET.find((item) => item.id === id);
}
