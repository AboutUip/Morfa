import type { CanvasResolvedFrame } from "@morfa/shared/canvas-layout";

import { ApiError } from "../lib/errors.js";
import type {
  CanvasLinkDto,
  CanvasPageDto,
} from "./canvasDocuments.js";
import { resolvePageFrames } from "./canvasFrames.js";

export type CanvasCaptureMode = "page" | "node" | "canvas";

export const CANVAS_CAPTURE_PADDING = 48;
const DEFAULT_PAGE_SIZE = 800;

export interface CanvasCaptureBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasCaptureGeometry {
  width: number;
  height: number;
  background: string;
  bounds?: CanvasCaptureBounds;
  pageCount?: number;
  nodeCount?: number;
}

function nodeSize(frame: CanvasResolvedFrame | null) {
  return {
    width:
      frame && Number.isFinite(frame.width)
        ? frame.width
        : DEFAULT_PAGE_SIZE,
    height:
      frame && Number.isFinite(frame.height)
        ? frame.height
        : DEFAULT_PAGE_SIZE,
  };
}

/**
 * Compute the viewport a screenshot needs. The render route and Chrome window
 * sizing both call this so the HTML page and the captured pixels agree.
 */
export function resolveCanvasCaptureGeometry(
  pages: CanvasPageDto[],
  links: CanvasLinkDto[],
  mode: CanvasCaptureMode,
  pageId?: string,
): CanvasCaptureGeometry {
  const frames = resolvePageFrames(pages, links);

  if (mode === "page" || mode === "node") {
    if (!pageId || !pages.some((page) => page.id === pageId)) {
      throw new ApiError(404, "PAGE_NOT_FOUND", "页面不存在");
    }
    const size = nodeSize(frames.get(pageId) ?? null);
    return {
      width: size.width,
      height: size.height,
      background: "#ffffff",
    };
  }

  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const roots = pages.filter(
    (page) => !page.parentId || !pagesById.has(page.parentId),
  );
  const rootFrames = roots
    .map((page) => frames.get(page.id) ?? null)
    .filter((frame): frame is CanvasResolvedFrame => frame !== null);

  if (rootFrames.length === 0) {
    throw new ApiError(
      400,
      "SCREENSHOT_EMPTY_CANVAS",
      "画布没有可截图的页面",
    );
  }

  const minX = Math.min(...rootFrames.map((frame) => frame.worldX));
  const minY = Math.min(...rootFrames.map((frame) => frame.worldY));
  const maxX = Math.max(
    ...rootFrames.map((frame) => frame.worldX + frame.width),
  );
  const maxY = Math.max(
    ...rootFrames.map((frame) => frame.worldY + frame.height),
  );
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);

  return {
    width: Math.ceil(contentWidth + CANVAS_CAPTURE_PADDING * 2),
    height: Math.ceil(contentHeight + CANVAS_CAPTURE_PADDING * 2),
    background: "#eef2f8",
    bounds: {
      x: minX,
      y: minY,
      width: contentWidth,
      height: contentHeight,
    },
    pageCount: roots.length,
    nodeCount: pages.length,
  };
}
