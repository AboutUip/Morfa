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

export function getPageSize(page: CanvasPage) {
  const width = Number.parseFloat(page.styles.width ?? "");
  const height = Number.parseFloat(page.styles.height ?? "");

  return {
    width: Number.isFinite(width) && width > 0 ? width : 800,
    height: Number.isFinite(height) && height > 0 ? height : 800,
  };
}
