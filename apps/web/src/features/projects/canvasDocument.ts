import type { CanvasPageDto } from "../../lib/api";

export type CanvasPage = CanvasPageDto;

export const DEFAULT_PAGE_STYLES: Record<string, string> = {
  width: "800px",
  height: "800px",
  "background-color": "#ffffff",
};

export function createPageStyles(): Record<string, string> {
  return { ...DEFAULT_PAGE_STYLES };
}

export function createPageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `page-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function uniquePageName(baseName: string, pages: CanvasPage[]) {
  if (!pages.some((page) => page.name === baseName)) {
    return baseName;
  }

  let index = 2;
  while (pages.some((page) => page.name === `${baseName} ${index}`)) {
    index += 1;
  }

  return `${baseName} ${index}`;
}

export function getPageSize(page: CanvasPage) {
  const width = Number.parseFloat(page.styles.width ?? "");
  const height = Number.parseFloat(page.styles.height ?? "");

  return {
    width: Number.isFinite(width) && width > 0 ? width : 800,
    height: Number.isFinite(height) && height > 0 ? height : 800,
  };
}
