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
  nameKey: string;
  descriptionKey: string;
}

export const CONTAINER_DRAG_MIME = "application/x-morfa-container";

export const CONTAINER_MARKET: readonly MarketContainer[] = [
  {
    id: "container-blank",
    type: "container",
    target: "both",
    width: 800,
    height: 800,
    nameKey: "projects.workspace.componentMarket.items.blank.name",
    descriptionKey: "projects.workspace.componentMarket.items.blank.description",
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

export function getMarketContainer(id: string) {
  return CONTAINER_MARKET.find((item) => item.id === id);
}
