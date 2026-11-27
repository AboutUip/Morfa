import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { CanvasResolvedFrame } from "@morfa/shared/canvas-layout";

import { hasPageClipboard } from "./canvasClipboard";
import type { CanvasTool } from "./canvasTools";
import {
  createPageId,
  createPageStyles,
  getCanvasLayout,
  getLinkAnchorPoint,
  isPageSeeThrough,
  projectPointToPageEdge,
  resolveStyleVariables,
  uniquePageName,
  type CanvasLink,
  type CanvasLinkAnchor,
  type CanvasLinkEdge,
  type CanvasPage,
} from "./canvasDocument";
import {
  DEFAULT_CANVAS_SNAP_SETTINGS,
  type CanvasSnapSettings,
} from "./canvasSnap";
import {
  CONTAINER_DRAG_MIME,
  getMarketItem,
} from "./componentMarket";
import { CONTROL_DRAG_MIME } from "./canvasControls";
import { topSelectedIds } from "./canvasHierarchy";
import { styleVariables } from "./canvasRuntime";
import { CanvasNodeView } from "./CanvasNodeView";
import { CanvasWidgetView } from "./CanvasWidgetView";
import styles from "./CanvasViewport.module.css";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const BASE_GRID = 24;
const MIN_GRID_SCREEN = 12;
const MAX_GRID_SCREEN = 72;
const MAJOR_GRID_CELLS = 5;
const ZOOM_SENSITIVITY = 0.0015;
const KEYBOARD_ZOOM_STEP = 1.2;
const SNAP_THRESHOLD_PX = 6;
const MOVE_DRAG_THRESHOLD_PX = 3;
const MIN_PAGE_SIZE = 32;
const LINK_EDGE_BAND_PX = 12;
const LINK_CORNER_GUARD_PX = 18;
const LINK_TARGET_MARGIN_PX = 20;
const RESIZE_CORNERS: readonly ResizeCorner[] = [
  "tl",
  "tr",
  "bl",
  "br",
];

interface CanvasView {
  x: number;
  y: number;
  zoom: number;
}

interface PanSession {
  pointerId: number;
  x: number;
  y: number;
}

interface MarqueeSession {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface MoveOrigin {
  id: string;
  x: number;
  y: number;
}

interface MoveSession {
  pointerId: number;
  pageId: string;
  startWorldX: number;
  startWorldY: number;
  startX: number;
  startY: number;
  startClientX: number;
  startClientY: number;
  started: boolean;
  origins: MoveOrigin[];
}

type ResizeCorner = "tl" | "tr" | "bl" | "br";

interface ResizeSession {
  pointerId: number;
  pageId: string;
  corner: ResizeCorner;
  startX: number;
  startY: number;
  startPageX: number;
  startPageY: number;
  startWidth: number;
  startHeight: number;
  zoom: number;
}

interface SnapGuides {
  x: number | null;
  y: number | null;
}

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GestureSession {
  view: CanvasView;
  px: number;
  py: number;
}

interface CanvasContextMenuState {
  kind: "page" | "canvas";
  pageId: string | null;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
}

interface LinkHoverState {
  pageId: string;
  pageName: string;
  x: number;
  y: number;
}

interface LinkDragState {
  pointerId: number;
  fromId: string;
  fromName: string;
  fromAnchor: CanvasLinkAnchor;
  x: number;
  y: number;
  targetId: string | null;
  targetName: string | null;
  targetAnchor: CanvasLinkAnchor | null;
}

interface LinkMenuState {
  linkId: string;
  x: number;
  y: number;
}

interface CanvasViewportProps {
  label: string;
  activeTool: CanvasTool;
  pages: CanvasPage[];
  /**
   * Full document used to resolve control state content for instances. The
   * `pages` prop still only contains visible top-level nodes.
   */
  fullPages?: CanvasPage[];
  links: CanvasLink[];
  selectedIds: string[];
  selectedLinkId: string | null;
  showNodeNames?: boolean;
  snapSettings?: CanvasSnapSettings;
  onSelectPage: (pageId: string | null) => void;
  onSelectPages: (pageIds: string[]) => void;
  onSelectLink: (linkId: string) => void;
  onCreatePage: (page: CanvasPage) => void;
  onCreateControlContainer?: (position: {
    x: number;
    y: number;
  }) => void;
  onCreateControlInstance?: (
    controlId: string,
    position: { x: number; y: number; parentId?: string },
  ) => void;
  onCreateLink: (
    fromId: string,
    toId: string,
    fromAnchor: CanvasLinkAnchor,
    toAnchor: CanvasLinkAnchor,
  ) => void;
  onDeleteLink: (linkId: string) => void;
  onMovePages: (
    moves: { pageId: string; worldX: number; worldY: number }[],
  ) => void;
  onMovePageStart: () => void;
  onMovePageEnd: (pageIds: string[], moved: boolean) => void;
  onResizePage: (
    pageId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  onResizePageStart: () => void;
  onResizePageEnd: () => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (pageId: string) => void;
  onCopyPage: (pageId: string) => void;
  onCutPage: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onPastePage: (position?: { x: number; y: number }) => void;
  onRunPage: (pageId: string) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toReactStyle(styles: Record<string, string>): CSSProperties {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(styles)) {
    if (key.startsWith("--")) {
      result[key] = value;
      continue;
    }

    result[key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())] =
      value;
  }

  return result as CSSProperties;
}

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function blurActiveEditableElement() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && isEditableElement(activeElement)) {
    activeElement.blur();
  }
}

function findPageAt(
  pages: CanvasPage[],
  layout: Map<string, CanvasResolvedFrame>,
  worldX: number,
  worldY: number,
) {
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index];
    const frame = layout.get(page.id);
    if (!frame) continue;

    if (
      worldX >= frame.worldX &&
      worldX <= frame.worldX + frame.width &&
      worldY >= frame.worldY &&
      worldY <= frame.worldY + frame.height
    ) {
      return page;
    }
  }

  return null;
}

function findPageIdsInMarquee(
  pages: CanvasPage[],
  layout: Map<string, CanvasResolvedFrame>,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  view: CanvasView,
) {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const right = Math.max(startX, endX);
  const bottom = Math.max(startY, endY);
  if (right - left < 2 && bottom - top < 2) return [];

  const worldLeft = (left - view.x) / view.zoom;
  const worldTop = (top - view.y) / view.zoom;
  const worldRight = (right - view.x) / view.zoom;
  const worldBottom = (bottom - view.y) / view.zoom;

  return pages
    .filter((page) => {
      const frame = layout.get(page.id);
      if (!frame) return false;
      return (
        frame.worldX < worldRight &&
        frame.worldX + frame.width > worldLeft &&
        frame.worldY < worldBottom &&
        frame.worldY + frame.height > worldTop
      );
    })
    .map((page) => page.id);
}

function findLinkSourcePageAt(
  pages: CanvasPage[],
  layout: Map<string, CanvasResolvedFrame>,
  worldX: number,
  worldY: number,
  view: CanvasView,
) {
  const band = LINK_EDGE_BAND_PX / view.zoom;
  const cornerGuard = LINK_CORNER_GUARD_PX / view.zoom;

  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index];
    if (page.parentId || page.nodeKind === "control-instance") continue;
    const frame = layout.get(page.id);
    if (!frame) continue;
    if (
      worldX < frame.worldX - band ||
      worldX > frame.worldX + frame.width + band ||
      worldY < frame.worldY - band ||
      worldY > frame.worldY + frame.height + band
    ) {
      continue;
    }

    // 加号只允许从组件外侧边缘触发，鼠标在组件内部时跳过该组件。
    if (
      worldX > frame.worldX &&
      worldX < frame.worldX + frame.width &&
      worldY > frame.worldY &&
      worldY < frame.worldY + frame.height
    ) {
      continue;
    }

    const left = Math.abs(worldX - frame.worldX);
    const right = Math.abs(worldX - (frame.worldX + frame.width));
    const top = Math.abs(worldY - frame.worldY);
    const bottom = Math.abs(worldY - (frame.worldY + frame.height));
    const nearVertical = Math.min(left, right) <= band;
    const nearHorizontal = Math.min(top, bottom) <= band;
    if (!nearVertical && !nearHorizontal) continue;

    if (
      Math.min(left, right) <= cornerGuard &&
      Math.min(top, bottom) <= cornerGuard
    ) {
      continue;
    }

    return page;
  }

  return null;
}

function findLinkTargetPageAt(
  pages: CanvasPage[],
  layout: Map<string, CanvasResolvedFrame>,
  worldX: number,
  worldY: number,
  excludeId: string,
  view: CanvasView,
) {
  const margin = LINK_TARGET_MARGIN_PX / view.zoom;

  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index];
    if (
      page.id === excludeId ||
      page.parentId ||
      page.nodeKind === "control-instance"
    ) {
      continue;
    }
    const frame = layout.get(page.id);
    if (!frame) continue;
    if (
      worldX >= frame.worldX - margin &&
      worldX <= frame.worldX + frame.width + margin &&
      worldY >= frame.worldY - margin &&
      worldY <= frame.worldY + frame.height + margin
    ) {
      return page;
    }
  }

  return null;
}

function edgeNormal(edge: CanvasLinkEdge) {
  if (edge === "left") return { x: -1, y: 0 };
  if (edge === "right") return { x: 1, y: 0 };
  if (edge === "top") return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function buildLinkCurve(
  from: { x: number; y: number },
  fromEdge: CanvasLinkEdge,
  to: { x: number; y: number },
  toEdge: CanvasLinkEdge,
) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const control = Math.max(36, Math.min(220, distance * 0.35));
  const fromNormal = edgeNormal(fromEdge);
  const toNormal = edgeNormal(toEdge);
  const c1 = {
    x: from.x + fromNormal.x * control,
    y: from.y + fromNormal.y * control,
  };
  const c2 = {
    x: to.x + toNormal.x * control,
    y: to.y + toNormal.y * control,
  };

  return {
    c1,
    c2,
    d: `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`,
  };
}

function buildArrowPath(
  tip: { x: number; y: number },
  direction: { x: number; y: number },
  size = 9,
) {
  const length = Math.hypot(direction.x, direction.y);
  if (!length) return "";
  const ux = direction.x / length;
  const uy = direction.y / length;
  const baseX = tip.x - ux * size;
  const baseY = tip.y - uy * size;
  const half = size * 0.55;
  const px = -uy;
  const py = ux;

  return `M ${tip.x} ${tip.y} L ${baseX + px * half} ${
    baseY + py * half
  } L ${baseX - px * half} ${baseY - py * half} Z`;
}

function nearestSnap(
  anchors: number[],
  lines: number[],
  threshold: number,
) {
  let best: { diff: number; line: number } | null = null;

  for (const line of lines) {
    for (const anchor of anchors) {
      const diff = line - anchor;
      if (Math.abs(diff) > threshold) continue;
      if (!best || Math.abs(diff) < Math.abs(best.diff)) {
        best = { diff, line };
      }
    }
  }

  return best;
}

function collectSnapLines(input: {
  pages: CanvasPage[];
  layout: Map<string, CanvasResolvedFrame>;
  excludeId: string;
  view: CanvasView;
  viewportWidth: number;
  viewportHeight: number;
  settings: CanvasSnapSettings;
}) {
  const {
    pages,
    layout,
    excludeId,
    view,
    viewportWidth,
    viewportHeight,
    settings,
  } = input;
  const xLines: number[] = [];
  const yLines: number[] = [];
  const addLine = (lines: number[], value: number) => {
    if (Number.isFinite(value)) lines.push(value);
  };

  const left = -view.x / view.zoom;
  const right = (viewportWidth - view.x) / view.zoom;
  const top = -view.y / view.zoom;
  const bottom = (viewportHeight - view.y) / view.zoom;

  if (settings.vertical) {
    addLine(xLines, (left + right) / 2);
  }
  if (settings.horizontal) {
    addLine(yLines, (top + bottom) / 2);
  }
  if (settings.thirds) {
    addLine(xLines, left + (right - left) / 3);
    addLine(xLines, left + ((right - left) * 2) / 3);
    addLine(yLines, top + (bottom - top) / 3);
    addLine(yLines, top + ((bottom - top) * 2) / 3);
  }

  if (settings.componentBounds) {
    for (const page of pages) {
      if (page.id === excludeId) continue;
      const frame = layout.get(page.id);
      if (!frame) continue;
      addLine(xLines, frame.worldX);
      addLine(xLines, frame.worldX + frame.width / 2);
      addLine(xLines, frame.worldX + frame.width);
      addLine(yLines, frame.worldY);
      addLine(yLines, frame.worldY + frame.height / 2);
      addLine(yLines, frame.worldY + frame.height);
    }
  }

  return { xLines, yLines };
}

function resolvePageSnap(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  pages: CanvasPage[];
  layout: Map<string, CanvasResolvedFrame>;
  movingId: string;
  view: CanvasView;
  viewportWidth: number;
  viewportHeight: number;
  settings?: CanvasSnapSettings;
}) {
  const {
    x,
    y,
    width,
    height,
    pages,
    layout,
    movingId,
    view,
    viewportWidth,
    viewportHeight,
    settings = DEFAULT_CANVAS_SNAP_SETTINGS,
  } = input;

  if (!settings.enabled) {
    return { x, y, guides: null };
  }

  const { xLines, yLines } = collectSnapLines({
    pages,
    layout,
    excludeId: movingId,
    view,
    viewportWidth,
    viewportHeight,
    settings,
  });

  if (settings.grid) {
    const step = resolveGridStep(view.zoom);
    for (const anchor of [x, x + width / 2, x + width]) {
      xLines.push(Math.round(anchor / step) * step);
    }
    for (const anchor of [y, y + height / 2, y + height]) {
      yLines.push(Math.round(anchor / step) * step);
    }
  }

  const threshold = SNAP_THRESHOLD_PX / view.zoom;
  const xSnap = nearestSnap(
    [x, x + width / 2, x + width],
    xLines,
    threshold,
  );
  const ySnap = nearestSnap(
    [y, y + height / 2, y + height],
    yLines,
    threshold,
  );

  return {
    x: x + (xSnap?.diff ?? 0),
    y: y + (ySnap?.diff ?? 0),
    guides:
      xSnap || ySnap
        ? {
            x: xSnap ? xSnap.line * view.zoom + view.x : null,
            y: ySnap ? ySnap.line * view.zoom + view.y : null,
          }
        : null,
  };
}

function resolvePageResizeSnap(input: {
  corner: ResizeCorner;
  x: number;
  y: number;
  width: number;
  height: number;
  pages: CanvasPage[];
  layout: Map<string, CanvasResolvedFrame>;
  resizingId: string;
  view: CanvasView;
  viewportWidth: number;
  viewportHeight: number;
  settings?: CanvasSnapSettings;
}) {
  const {
    corner,
    x,
    y,
    width,
    height,
    pages,
    layout,
    resizingId,
    view,
    viewportWidth,
    viewportHeight,
    settings = DEFAULT_CANVAS_SNAP_SETTINGS,
  } = input;

  if (!settings.enabled) {
    return { x, y, width, height, guides: null };
  }

  const isLeft = corner === "tl" || corner === "bl";
  const isTop = corner === "tl" || corner === "tr";
  const movingX = isLeft ? x : x + width;
  const movingY = isTop ? y : y + height;

  const { xLines, yLines } = collectSnapLines({
    pages,
    layout,
    excludeId: resizingId,
    view,
    viewportWidth,
    viewportHeight,
    settings,
  });

  if (settings.grid) {
    const step = resolveGridStep(view.zoom);
    xLines.push(Math.round(movingX / step) * step);
    yLines.push(Math.round(movingY / step) * step);
  }

  const threshold = SNAP_THRESHOLD_PX / view.zoom;
  const xSnap = nearestSnap([movingX], xLines, threshold);
  const ySnap = nearestSnap([movingY], yLines, threshold);
  let nextX = x;
  let nextY = y;
  let nextWidth = width;
  let nextHeight = height;
  let guideX: number | null = null;
  let guideY: number | null = null;

  if (xSnap) {
    if (isLeft) {
      const fixedRight = x + width;
      nextWidth = Math.max(MIN_PAGE_SIZE, fixedRight - xSnap.line);
      nextX = fixedRight - nextWidth;
    } else {
      nextWidth = Math.max(MIN_PAGE_SIZE, xSnap.line - x);
      nextX = x;
    }

    const edge = isLeft ? nextX : nextX + nextWidth;
    if (Math.abs(edge - xSnap.line) < 0.01) {
      guideX = xSnap.line * view.zoom + view.x;
    }
  }

  if (ySnap) {
    if (isTop) {
      const fixedBottom = y + height;
      nextHeight = Math.max(
        MIN_PAGE_SIZE,
        fixedBottom - ySnap.line,
      );
      nextY = fixedBottom - nextHeight;
    } else {
      nextHeight = Math.max(MIN_PAGE_SIZE, ySnap.line - y);
      nextY = y;
    }

    const edge = isTop ? nextY : nextY + nextHeight;
    if (Math.abs(edge - ySnap.line) < 0.01) {
      guideY = ySnap.line * view.zoom + view.y;
    }
  }

  return {
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight,
    guides:
      guideX !== null || guideY !== null
        ? { x: guideX, y: guideY }
        : null,
  };
}

function normalizeWheelDelta(
  event: WheelEvent,
  viewportHeight: number,
): { x: number; y: number } {
  const unit =
    event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? viewportHeight
        : 1;

  return {
    x: event.deltaX * unit,
    y: event.deltaY * unit,
  };
}

/**
 * 让网格在任意缩放级别下都保持可读的屏幕间距。
 * 返回的是世界坐标中的网格步长。
 */
function resolveGridStep(zoom: number) {
  let step = BASE_GRID;

  while (step * zoom < MIN_GRID_SCREEN) {
    step *= 2;
  }
  while (step * zoom > MAX_GRID_SCREEN) {
    step /= 2;
  }

  return step;
}

export function CanvasViewport({
  label,
  activeTool,
  pages,
  fullPages,
  links,
  selectedIds,
  selectedLinkId,
  showNodeNames = false,
  snapSettings = DEFAULT_CANVAS_SNAP_SETTINGS,
  onSelectPage,
  onSelectPages,
  onSelectLink,
  onCreatePage,
  onCreateControlContainer,
  onCreateControlInstance,
  onCreateLink,
  onDeleteLink,
  onMovePages,
  onMovePageStart,
  onMovePageEnd,
  onResizePage,
  onResizePageStart,
  onResizePageEnd,
  onRenamePage,
  onDeletePage,
  onCopyPage,
  onCutPage,
  onDuplicatePage,
  onPastePage,
  onRunPage,
}: CanvasViewportProps) {
  const { t } = useTranslation();
  const layout = getCanvasLayout(pages, links);
  const renderPages = fullPages ?? pages;
  const viewportRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<CanvasView>({
    x: 0,
    y: 0,
    zoom: 1,
  });
  const viewRef = useRef(view);
  const panRef = useRef<PanSession | null>(null);
  const marqueeRef = useRef<MarqueeSession | null>(null);
  const moveRef = useRef<MoveSession | null>(null);
  const resizeRef = useRef<ResizeSession | null>(null);
  const linkDragRef = useRef<LinkDragState | null>(null);
  const gestureRef = useRef<GestureSession | null>(null);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [movingPage, setMovingPage] = useState(false);
  const [resizingCorner, setResizingCorner] =
    useState<ResizeCorner | null>(null);
  const [hoveringPage, setHoveringPage] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [linkHover, setLinkHover] = useState<LinkHoverState | null>(
    null,
  );
  const [linkDrag, setLinkDrag] = useState<LinkDragState | null>(
    null,
  );
  const [linkMenu, setLinkMenu] = useState<LinkMenuState | null>(
    null,
  );
  const [snapGuides, setSnapGuides] = useState<SnapGuides | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [contextMenu, setContextMenu] =
    useState<CanvasContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameCancelRef = useRef(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    setMoveTargetId(null);
    setHoveringPage(false);
    setLinkHover(null);
  }, [activeTool]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("wheel", closeMenu, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("wheel", closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (
      contextMenu?.kind === "page" &&
      contextMenu.pageId &&
      !pages.some((page) => page.id === contextMenu.pageId)
    ) {
      setContextMenu(null);
    }
  }, [pages, contextMenu]);

  useEffect(() => {
    if (!linkMenu) return;

    const closeMenu = () => setLinkMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("wheel", closeMenu, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("wheel", closeMenu);
    };
  }, [linkMenu]);

  useEffect(() => {
    if (!linkDrag) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      linkDragRef.current = null;
      setLinkDrag(null);
      setLinkHover(null);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () =>
      window.removeEventListener("keydown", handleKeyDown, true);
  }, [linkDrag]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const { x: deltaX, y: deltaY } = normalizeWheelDelta(
        event,
        element.clientHeight,
      );

      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const factor = Math.exp(-deltaY * ZOOM_SENSITIVITY);

        setView((current) => {
          const zoom = clamp(
            current.zoom * factor,
            MIN_ZOOM,
            MAX_ZOOM,
          );
          if (zoom === current.zoom) return current;

          const worldX = (px - current.x) / current.zoom;
          const worldY = (py - current.y) / current.zoom;

          return {
            x: px - worldX * zoom,
            y: py - worldY * zoom,
            zoom,
          };
        });
        return;
      }

      let x = deltaX;
      let y = deltaY;

      // 鼠标滚轮的 Shift 横向滚动；触控板已经自带 deltaX 时不改写。
      if (event.shiftKey && x === 0) {
        x = y;
        y = 0;
      }

      if (x === 0 && y === 0) return;

      setView((current) => ({
        ...current,
        x: current.x - x,
        y: current.y - y,
      }));
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (document.body.dataset.canvasModal === "true") return;
      if (event.code !== "Minus" && event.code !== "NumpadSubtract") {
        return;
      }

      const element = viewportRef.current;
      if (!element) return;

      event.preventDefault();
      const px = element.clientWidth / 2;
      const py = element.clientHeight / 2;

      setView((current) => {
        const zoom = clamp(
          current.zoom / KEYBOARD_ZOOM_STEP,
          MIN_ZOOM,
          MAX_ZOOM,
        );
        if (zoom === current.zoom) return current;

        const worldX = (px - current.x) / current.zoom;
        const worldY = (py - current.y) / current.zoom;

        return {
          x: px - worldX * zoom,
          y: py - worldY * zoom,
          zoom,
        };
      });
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    type GestureLikeEvent = Event & {
      scale?: number;
      clientX?: number;
      clientY?: number;
    };

    const pointFromEvent = (event: GestureLikeEvent) => {
      const rect = element.getBoundingClientRect();
      const clientX =
        typeof event.clientX === "number" &&
        Number.isFinite(event.clientX)
          ? event.clientX
          : rect.left + rect.width / 2;
      const clientY =
        typeof event.clientY === "number" &&
        Number.isFinite(event.clientY)
          ? event.clientY
          : rect.top + rect.height / 2;

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const handleGestureStart = (rawEvent: Event) => {
      rawEvent.preventDefault();
      const point = pointFromEvent(rawEvent as GestureLikeEvent);
      gestureRef.current = {
        view: viewRef.current,
        px: point.x,
        py: point.y,
      };
    };

    const handleGestureChange = (rawEvent: Event) => {
      rawEvent.preventDefault();
      const event = rawEvent as GestureLikeEvent;
      const session = gestureRef.current;
      if (!session || typeof event.scale !== "number") return;

      const zoom = clamp(
        session.view.zoom * event.scale,
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const worldX = (session.px - session.view.x) / session.view.zoom;
      const worldY = (session.py - session.view.y) / session.view.zoom;

      setView({
        x: session.px - worldX * zoom,
        y: session.py - worldY * zoom,
        zoom,
      });
    };

    const handleGestureEnd = (rawEvent: Event) => {
      rawEvent.preventDefault();
      gestureRef.current = null;
    };

    element.addEventListener("gesturestart", handleGestureStart, {
      passive: false,
    });
    element.addEventListener("gesturechange", handleGestureChange, {
      passive: false,
    });
    element.addEventListener("gestureend", handleGestureEnd, {
      passive: false,
    });

    return () => {
      element.removeEventListener("gesturestart", handleGestureStart);
      element.removeEventListener("gesturechange", handleGestureChange);
      element.removeEventListener("gestureend", handleGestureEnd);
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    // 画布会阻止 pointerdown 的默认行为，需要主动让属性输入框失焦并提交。
    blurActiveEditableElement();
    if (!isEditableElement(event.target)) {
      event.currentTarget.focus({ preventScroll: true });
    }

    if (event.button === 0 && activeTool === "select") {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const currentView = viewRef.current;
      const worldX = (x - currentView.x) / currentView.zoom;
      const worldY = (y - currentView.y) / currentView.zoom;
      const source = findLinkSourcePageAt(
        pages,
        layout,
        worldX,
        worldY,
        currentView,
      );

      if (source) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const session: LinkDragState = {
          pointerId: event.pointerId,
          fromId: source.id,
          fromName: source.name,
          fromAnchor: projectPointToPageEdge(
            source,
            worldX,
            worldY,
            pages,
            links,
          ),
          x,
          y,
          targetId: null,
          targetName: null,
          targetAnchor: null,
        };
        linkDragRef.current = session;
        setLinkDrag(session);
        setLinkHover(null);
        return;
      }
    }

    const isMiddlePan = event.button === 1;
    const isHandPan = event.button === 0 && activeTool === "hand";

    if (isMiddlePan || isHandPan) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      setPanning(true);
      return;
    }

    if (event.button === 0 && activeTool === "move") {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const currentView = viewRef.current;
      const worldX = (x - currentView.x) / currentView.zoom;
      const worldY = (y - currentView.y) / currentView.zoom;
      const hit = findPageAt(pages, layout, worldX, worldY);

      if (!hit) {
        setMoveTargetId(null);
        setHoveringPage(false);
        onSelectPage(null);
        return;
      }

      const groupIds = selectedIds.includes(hit.id)
        ? topSelectedIds(pages, selectedIds)
        : [hit.id];
      const origins = groupIds.map((id) => {
        const item = pages.find((page) => page.id === id);
        const itemFrame = layout.get(id);
        return {
          id,
          x: itemFrame?.worldX ?? item?.x ?? 0,
          y: itemFrame?.worldY ?? item?.y ?? 0,
        };
      });
      const anchor =
        origins.find((origin) => origin.id === hit.id) ?? origins[0];
      event.currentTarget.setPointerCapture(event.pointerId);
      if (!selectedIds.includes(hit.id)) onSelectPage(hit.id);
      setMoveTargetId(hit.id);
      setHoveringPage(true);
      setSnapGuides(null);
      moveRef.current = {
        pointerId: event.pointerId,
        pageId: hit.id,
        startWorldX: worldX,
        startWorldY: worldY,
        startX: anchor?.x ?? hit.x,
        startY: anchor?.y ?? hit.y,
        startClientX: event.clientX,
        startClientY: event.clientY,
        started: false,
        origins,
      };
      onMovePageStart();
      return;
    }

    if (event.button !== 0 || activeTool !== "select") return;

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const currentView = viewRef.current;
    const worldX = (x - currentView.x) / currentView.zoom;
    const worldY = (y - currentView.y) / currentView.zoom;
    const hit = findPageAt(pages, layout, worldX, worldY);

    onSelectPage(hit?.id ?? null);
    if (hit) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    marqueeRef.current = {
      pointerId: event.pointerId,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    };
    setMarquee({
      left: x,
      top: y,
      width: 0,
      height: 0,
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const linkSession = linkDragRef.current;
    if (linkSession && linkSession.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const currentView = viewRef.current;
      const worldX = (x - currentView.x) / currentView.zoom;
      const worldY = (y - currentView.y) / currentView.zoom;
      const target = findLinkTargetPageAt(
        pages,
        layout,
        worldX,
        worldY,
        linkSession.fromId,
        currentView,
      );
      const targetAnchor = target
        ? projectPointToPageEdge(
            target,
            worldX,
            worldY,
            pages,
            links,
          )
        : null;
      const next: LinkDragState = {
        ...linkSession,
        x,
        y,
        targetId: target?.id ?? null,
        targetName: target?.name ?? null,
        targetAnchor,
      };
      linkDragRef.current = next;
      setLinkDrag(next);
      return;
    }

    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      if (dx === 0 && dy === 0) return;

      pan.x = event.clientX;
      pan.y = event.clientY;
      setView((current) => ({
        ...current,
        x: current.x + dx,
        y: current.y + dy,
      }));
      return;
    }

    const move = moveRef.current;
    if (move && move.pointerId === event.pointerId) {
      if (!move.started) {
        const dx = event.clientX - move.startClientX;
        const dy = event.clientY - move.startClientY;
        if (
          Math.hypot(dx, dy) < MOVE_DRAG_THRESHOLD_PX
        ) {
          return;
        }
        move.started = true;
        setMovingPage(true);
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const currentView = viewRef.current;
      const worldX =
        (event.clientX - rect.left - currentView.x) / currentView.zoom;
      const worldY =
        (event.clientY - rect.top - currentView.y) / currentView.zoom;
      const rawX = move.startX + (worldX - move.startWorldX);
      const rawY = move.startY + (worldY - move.startWorldY);
      const movingFrame = layout.get(move.pageId);
      const applyDelta = (dx: number, dy: number) => {
        onMovePages(
          move.origins.map((origin) => ({
            pageId: origin.id,
            worldX: origin.x + dx,
            worldY: origin.y + dy,
          })),
        );
      };

      if (!movingFrame) {
        applyDelta(rawX - move.startX, rawY - move.startY);
        setSnapGuides(null);
        return;
      }

      const resolution = resolvePageSnap({
        x: rawX,
        y: rawY,
        width: movingFrame.width,
        height: movingFrame.height,
        pages,
        layout,
        movingId: move.pageId,
        view: currentView,
        viewportWidth: event.currentTarget.clientWidth,
        viewportHeight: event.currentTarget.clientHeight,
        settings: snapSettings,
      });

      applyDelta(resolution.x - move.startX, resolution.y - move.startY);
      setSnapGuides(resolution.guides);
      return;
    }

    const selection = marqueeRef.current;
    if (selection && selection.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      selection.currentX = x;
      selection.currentY = y;
      setMarquee({
        left: Math.min(selection.startX, x),
        top: Math.min(selection.startY, y),
        width: Math.abs(x - selection.startX),
        height: Math.abs(y - selection.startY),
      });
      return;
    }

    if (activeTool === "select" || activeTool === "move") {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const currentView = viewRef.current;
      const worldX = (x - currentView.x) / currentView.zoom;
      const worldY = (y - currentView.y) / currentView.zoom;
      const hit = findPageAt(pages, layout, worldX, worldY);
      setHoveringPage(Boolean(hit));

      if (activeTool === "select") {
        setMoveTargetId(null);
        const source = findLinkSourcePageAt(
          pages,
          layout,
          worldX,
          worldY,
          currentView,
        );
        setLinkHover(
          source
            ? {
                pageId: source.id,
                pageName: source.name,
                x,
                y,
              }
            : null,
        );
      } else {
        setMoveTargetId(hit?.id ?? null);
        setLinkHover(null);
      }
    } else {
      setLinkHover(null);
      setMoveTargetId(null);
      setHoveringPage(false);
    }
  };

  const endPan = (event: ReactPointerEvent<HTMLElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panRef.current = null;
    setPanning(false);
  };

  const endMarquee = (event: ReactPointerEvent<HTMLElement>) => {
    const selection = marqueeRef.current;
    if (!selection || selection.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    marqueeRef.current = null;
    setMarquee(null);

    onSelectPages(
      findPageIdsInMarquee(
        pages,
        layout,
        selection.startX,
        selection.startY,
        selection.currentX,
        selection.currentY,
        viewRef.current,
      ),
    );
  };

  const endMove = (event: ReactPointerEvent<HTMLElement>) => {
    const move = moveRef.current;
    if (!move || move.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const pageIds = move.origins.map((origin) => origin.id);
    const moved = move.started;
    moveRef.current = null;
    onMovePageEnd(pageIds.length ? pageIds : [move.pageId], moved);
    setMovingPage(false);
    setSnapGuides(null);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const linkSession = linkDragRef.current;
    if (linkSession && linkSession.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const currentView = viewRef.current;
      const worldX = (x - currentView.x) / currentView.zoom;
      const worldY = (y - currentView.y) / currentView.zoom;
      const target = findLinkTargetPageAt(
        pages,
        layout,
        worldX,
        worldY,
        linkSession.fromId,
        currentView,
      );

      if (target) {
        onCreateLink(
          linkSession.fromId,
          target.id,
          linkSession.fromAnchor,
          projectPointToPageEdge(
            target,
            worldX,
            worldY,
            pages,
            links,
          ),
        );
      }

      linkDragRef.current = null;
      setLinkDrag(null);
      setLinkHover(null);
      return;
    }

    if (panRef.current?.pointerId === event.pointerId) {
      endPan(event);
      return;
    }

    if (moveRef.current?.pointerId === event.pointerId) {
      endMove(event);
      return;
    }

    if (marqueeRef.current?.pointerId === event.pointerId) {
      endMarquee(event);
    }
  };

  const handleLostPointerCapture = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (linkDragRef.current?.pointerId === event.pointerId) {
      linkDragRef.current = null;
      setLinkDrag(null);
      setLinkHover(null);
    }

    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      setPanning(false);
    }

    if (moveRef.current?.pointerId === event.pointerId) {
      const move = moveRef.current;
      const pageIds = move.origins.map((origin) => origin.id);
      moveRef.current = null;
      onMovePageEnd(pageIds.length ? pageIds : [move.pageId], move.started);
      setMovingPage(false);
      setSnapGuides(null);
    }

    if (marqueeRef.current?.pointerId === event.pointerId) {
      marqueeRef.current = null;
      setMarquee(null);
    }
  };

  const startPageResize = (
    event: ReactPointerEvent<HTMLSpanElement>,
    page: CanvasPage,
    corner: ResizeCorner,
  ) => {
    if (page.lockedSize || event.button !== 0) return;

    blurActiveEditableElement();
    event.preventDefault();
    event.stopPropagation();

    const frame = layout.get(page.id);
    if (!frame) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      pageId: page.id,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      startPageX: frame.worldX,
      startPageY: frame.worldY,
      startWidth: frame.width,
      startHeight: frame.height,
      zoom: viewRef.current.zoom,
    };
    onResizePageStart();
    setResizingCorner(corner);
    setSnapGuides(null);
  };

  const handlePageResizeMove = (
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    event.stopPropagation();
    const dx = (event.clientX - resize.startX) / resize.zoom;
    const dy = (event.clientY - resize.startY) / resize.zoom;
    const isLeft =
      resize.corner === "tl" || resize.corner === "bl";
    const isTop =
      resize.corner === "tl" || resize.corner === "tr";
    const rawWidth = Math.max(
      MIN_PAGE_SIZE,
      resize.startWidth + (isLeft ? -dx : dx),
    );
    const rawHeight = Math.max(
      MIN_PAGE_SIZE,
      resize.startHeight + (isTop ? -dy : dy),
    );
    const rawX = isLeft
      ? resize.startPageX + resize.startWidth - rawWidth
      : resize.startPageX;
    const rawY = isTop
      ? resize.startPageY + resize.startHeight - rawHeight
      : resize.startPageY;

    const viewport = viewportRef.current;
    const resolution = resolvePageResizeSnap({
      corner: resize.corner,
      x: rawX,
      y: rawY,
      width: rawWidth,
      height: rawHeight,
      pages,
      layout,
      resizingId: resize.pageId,
      view: viewRef.current,
      viewportWidth: viewport?.clientWidth ?? 0,
      viewportHeight: viewport?.clientHeight ?? 0,
      settings: snapSettings,
    });

    onResizePage(
      resize.pageId,
      resolution.x,
      resolution.y,
      resolution.width,
      resolution.height,
    );
    setSnapGuides(resolution.guides);
  };

  const endPageResize = (
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    event.stopPropagation();
    resizeRef.current = null;
    setResizingCorner(null);
    setSnapGuides(null);
    onResizePageEnd();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePageResizeLostCapture = (
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    setResizingCorner(null);
    setSnapGuides(null);
    onResizePageEnd();
  };

  const handlePointerLeave = () => {
    if (!panRef.current && !moveRef.current && !marqueeRef.current) {
      setHoveringPage(false);
      setMoveTargetId(null);
    }
    if (!linkDragRef.current) {
      setLinkHover(null);
    }
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button === 1) event.preventDefault();
  };

  const handleAuxClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button === 1) event.preventDefault();
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if (isEditableElement(event.target)) return;

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const currentView = viewRef.current;
    const worldX =
      (event.clientX - rect.left - currentView.x) / currentView.zoom;
    const worldY =
      (event.clientY - rect.top - currentView.y) / currentView.zoom;
    const hit = findPageAt(pages, layout, worldX, worldY);
    const menuHeight = hit ? 196 : 48;

    if (hit) onSelectPage(hit.id);

    setContextMenu({
      kind: hit ? "page" : "canvas",
      pageId: hit?.id ?? null,
      x: Math.max(
        8,
        Math.min(event.clientX, window.innerWidth - 188),
      ),
      y: Math.max(
        8,
        Math.min(event.clientY, window.innerHeight - menuHeight),
      ),
      worldX,
      worldY,
    });
  };

  const startPageRename = (page: CanvasPage) => {
    renameCancelRef.current = false;
    setRenamingId(page.id);
    setRenameDraft(page.name);
    setContextMenu(null);
    onSelectPage(page.id);
  };

  const commitPageRename = (page: CanvasPage) => {
    if (renameCancelRef.current) {
      renameCancelRef.current = false;
      setRenamingId(null);
      setRenameDraft("");
      return;
    }

    const name = renameDraft.trim();
    if (name && name !== page.name) onRenamePage(page.id, name);
    setRenamingId(null);
    setRenameDraft("");
  };

  const handleRenameKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      renameCancelRef.current = true;
      setRenamingId(null);
      setRenameDraft("");
    }
  };

  const handleDragOver = (event: ReactDragEvent<HTMLElement>) => {
    const types = Array.from(event.dataTransfer.types);
    const acceptsControl =
      Boolean(onCreateControlInstance) &&
      types.includes(CONTROL_DRAG_MIME);
    if (!types.includes(CONTAINER_DRAG_MIME) && !acceptsControl) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };

  const handleDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setDropActive(false);
    }
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
    const controlId = event.dataTransfer.getData(CONTROL_DRAG_MIME);
    if (controlId) {
      if (!onCreateControlInstance) return;

      event.preventDefault();
      setDropActive(false);

      const rect = event.currentTarget.getBoundingClientRect();
      const currentView = viewRef.current;
      const worldX =
        (event.clientX - rect.left - currentView.x) / currentView.zoom;
      const worldY =
        (event.clientY - rect.top - currentView.y) / currentView.zoom;
      const parentPage = findPageAt(pages, layout, worldX, worldY);
      onCreateControlInstance(controlId, {
        x: worldX,
        y: worldY,
        ...(parentPage ? { parentId: parentPage.id } : {}),
      });
      return;
    }

    const containerId = event.dataTransfer.getData(CONTAINER_DRAG_MIME);
    if (!containerId) return;

    event.preventDefault();
    setDropActive(false);

    const item = getMarketItem(containerId);
    if (!item) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const currentView = viewRef.current;
    const worldX =
      (event.clientX - rect.left - currentView.x) / currentView.zoom;
    const worldY =
      (event.clientY - rect.top - currentView.y) / currentView.zoom;
    if (item.type === "container" && item.control) {
      onCreateControlContainer?.({ x: worldX, y: worldY });
      return;
    }

    const parentPage = findPageAt(pages, layout, worldX, worldY);
    const widget =
      item.type === "widget"
        ? {
            ...item.widget,
            ...(item.textKey ? { text: t(item.textKey) } : {}),
          }
        : undefined;
    const page: CanvasPage = {
      id: createPageId(pages),
      name: uniquePageName(t(item.nameKey), pages),
      x: worldX,
      y: worldY,
      ...(parentPage ? { parentId: parentPage.id } : {}),
      styles:
        item.type === "widget"
          ? {
              ...createPageStyles(),
              width: `${item.width}px`,
              height: `${item.height}px`,
              "background-color": "transparent",
              "border-color": "transparent",
              "box-shadow": "none",
            }
          : {
              ...createPageStyles(),
              width: `${item.width}px`,
              height: `${item.height}px`,
            },
      ...(item.type === "container" && item.frame
        ? { frame: item.frame }
        : {}),
      ...(item.type === "container" && item.lockedSize
        ? { lockedSize: true }
        : {}),
      ...(widget ? { widget } : {}),
    };

    onCreatePage(page);
    onSelectPage(page.id);
  };

  useEffect(() => {
    const handleDragEnd = () => setDropActive(false);
    window.addEventListener("dragend", handleDragEnd);
    return () => window.removeEventListener("dragend", handleDragEnd);
  }, []);

  const gridStep = resolveGridStep(view.zoom);
  const minorGridSize = gridStep * view.zoom;
  const majorGridSize = minorGridSize * MAJOR_GRID_CELLS;

  const gridStyle = {
    "--mf-grid-size": `${minorGridSize}px`,
    "--mf-grid-major-size": `${majorGridSize}px`,
    "--mf-grid-x": `${view.x}px`,
    "--mf-grid-y": `${view.y}px`,
  } as CSSProperties;

  const worldStyle = {
    transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`,
  } as CSSProperties;

  const contextMenuPage =
    contextMenu?.pageId
      ? pages.find((page) => page.id === contextMenu.pageId) ?? null
      : null;
  const canRunContextPage = Boolean(
    contextMenuPage &&
      (contextMenuPage.frame ||
        links.some(
          (link) =>
            link.fromId === contextMenuPage.id ||
            (link.direction === "two-way" &&
              link.toId === contextMenuPage.id),
        )),
  );

  const toScreenPoint = (point: { x: number; y: number }) => ({
    x: point.x * view.zoom + view.x,
    y: point.y * view.zoom + view.y,
  });

  const renderedLinks = links.flatMap((link) => {
    const fromPage = pages.find((page) => page.id === link.fromId);
    const toPage = pages.find((page) => page.id === link.toId);
    if (!fromPage || !toPage) return [];
    if (
      fromPage.parentId ||
      toPage.parentId ||
      fromPage.nodeKind === "control-instance" ||
      toPage.nodeKind === "control-instance"
    ) {
      return [];
    }

    const from = toScreenPoint(
      getLinkAnchorPoint(fromPage, link.fromAnchor, pages, links),
    );
    const to = toScreenPoint(
      getLinkAnchorPoint(toPage, link.toAnchor, pages, links),
    );
    const curve = buildLinkCurve(
      from,
      link.fromAnchor.edge,
      to,
      link.toAnchor.edge,
    );

    return [
      {
        link,
        fromPage,
        toPage,
        from,
        to,
        curve,
        targetArrow: buildArrowPath(
          to,
          { x: to.x - curve.c2.x, y: to.y - curve.c2.y },
        ),
        sourceArrow:
          link.direction === "two-way"
            ? buildArrowPath(
                from,
                { x: from.x - curve.c1.x, y: from.y - curve.c1.y },
              )
            : null,
        selected: selectedLinkId === link.id,
      },
    ];
  });

  const previewLink = (() => {
    if (!linkDrag) return null;
    const fromPage = pages.find((page) => page.id === linkDrag.fromId);
    if (!fromPage) return null;
    const from = toScreenPoint(
      getLinkAnchorPoint(
        fromPage,
        linkDrag.fromAnchor,
        pages,
        links,
      ),
    );
    const targetPage = linkDrag.targetId
      ? pages.find((page) => page.id === linkDrag.targetId) ?? null
      : null;
    const targetAnchor = linkDrag.targetAnchor;
    const to =
      targetPage && targetAnchor
        ? toScreenPoint(
            getLinkAnchorPoint(targetPage, targetAnchor, pages, links),
          )
        : { x: linkDrag.x, y: linkDrag.y };
    const toEdge =
      targetAnchor?.edge ??
      (to.x >= from.x ? "left" : "right");
    return buildLinkCurve(
      from,
      linkDrag.fromAnchor.edge,
      to,
      toEdge,
    );
  })();

  const linkCursor = linkDrag
    ? {
        x: linkDrag.x,
        y: linkDrag.y,
        label: linkDrag.targetName
          ? `${linkDrag.fromName} -> ${linkDrag.targetName}`
          : `${linkDrag.fromName} -> …`,
        valid: Boolean(linkDrag.targetId),
      }
    : linkHover
      ? {
          x: linkHover.x,
          y: linkHover.y,
          label: linkHover.pageName,
          valid: false,
        }
      : null;

  return (
    <main
      ref={viewportRef}
      id="project-main"
      className={styles.viewport}
      tabIndex={-1}
      aria-label={label}
      data-canvas-viewport="true"
      data-tool={activeTool}
      data-panning={panning}
      data-moving={movingPage}
      data-resizing-corner={resizingCorner ?? undefined}
      data-hover-page={hoveringPage}
      data-link-cursor={linkCursor ? "true" : undefined}
      data-marquee={marquee !== null}
      data-drop-active={dropActive}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerLeave}
      onLostPointerCapture={handleLostPointerCapture}
      onMouseDown={handleMouseDown}
      onAuxClick={handleAuxClick}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.grid} style={gridStyle} aria-hidden="true" />
      <div className={styles.world} style={worldStyle}>
        {pages.map((page) => {
          const resolvedStyles = resolveStyleVariables(
            page.styles,
            page,
            pages,
            links,
          );
          const frame = layout.get(page.id);
          if (!frame) return null;
          const surfaceStyles = { ...resolvedStyles };
          for (const key of [
            "width",
            "height",
            "min-width",
            "max-width",
            "min-height",
            "max-height",
            "aspect-ratio",
            "left",
            "right",
            "top",
            "bottom",
            "opacity",
          ]) {
            delete surfaceStyles[key];
          }
          const fill = resolvedStyles["background-color"]?.trim().toLowerCase() ?? "";
          const seeThrough =
            isPageSeeThrough(page) ||
            fill === "" ||
            fill === "transparent" ||
            fill === "none";
          const surface = (
            <div
              className={styles.pageSurface}
              data-see-through={seeThrough}
              style={toReactStyle(surfaceStyles)}
            />
          );

          return (
            <div
              key={page.id}
              className={styles.page}
              data-page-container="true"
              data-selected={selectedIds.includes(page.id)}
              data-move-target={
                activeTool === "move" && moveTargetId === page.id
              }
              style={{
                left: frame.worldX,
                top: frame.worldY,
                width: frame.width,
                height: frame.height,
                ...(resolvedStyles.visibility
                  ? {
                      visibility:
                        resolvedStyles.visibility as CSSProperties["visibility"],
                    }
                  : {}),
                ...(resolvedStyles.opacity
                  ? { opacity: resolvedStyles.opacity }
                  : {}),
                ...(resolvedStyles.display === "none"
                  ? { display: "none" as const }
                  : {}),
              }}
            >
              {renamingId === page.id ? (
                <input
                  className={styles.pageRenameInput}
                  style={{ transform: `scale(${1 / view.zoom})` }}
                  value={renameDraft}
                  autoFocus
                  aria-label={t(
                    "projects.workspace.canvas.contextMenu.rename",
                  )}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={() => commitPageRename(page)}
                  onKeyDown={handleRenameKeyDown}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onContextMenu={(event) => event.stopPropagation()}
                />
              ) : showNodeNames ? (
                <span
                  className={styles.pageLabel}
                  style={{ transform: `scale(${1 / view.zoom})` }}
                >
                  {page.name}
                </span>
              ) : null}

              {page.frame ? (
                <div
                  className={styles.deviceFrame}
                  data-frame={page.frame}
                  data-see-through={seeThrough}
                >
                  <div
                    className={styles.deviceScreen}
                    data-see-through={seeThrough}
                  >
                    {surface}
                    {page.frame === "iphone" ? (
                      <span className={styles.deviceNotch} />
                    ) : null}
                    {page.frame === "android" ? (
                      <span className={styles.deviceCamera} />
                    ) : null}
                  </div>
                  {page.frame === "watch" ? (
                    <span className={styles.deviceCrown} />
                  ) : null}
                </div>
              ) : (
                surface
              )}

              {page.widget ? (
                <div className={styles.widgetLayer}>
                  <CanvasWidgetView
                    widget={page.widget}
                    style={styleVariables(resolvedStyles) as CSSProperties}
                  />
                </div>
              ) : null}

              {page.nodeKind === "control-instance" ? (
                <div className={styles.controlPreview} aria-hidden="true">
                  <CanvasNodeView
                    page={page}
                    pages={renderPages}
                    links={links}
                    root
                    position={{ left: 0, top: 0 }}
                    maxDepth={8}
                  />
                </div>
              ) : null}

              {selectedIds.includes(page.id) && !page.lockedSize ? (
                <>
                  {RESIZE_CORNERS.map((corner) => (
                    <span
                      key={corner}
                      className={styles.pageResizeAnchor}
                      data-corner={corner}
                      style={{ transform: `scale(${1 / view.zoom})` }}
                      aria-hidden="true"
                    >
                      <span
                        className={styles.pageResizeHandle}
                        data-corner={corner}
                        onPointerDown={(event) =>
                          startPageResize(event, page, corner)
                        }
                        onPointerMove={handlePageResizeMove}
                        onPointerUp={endPageResize}
                        onPointerCancel={endPageResize}
                        onLostPointerCapture={
                          handlePageResizeLostCapture
                        }
                      />
                    </span>
                  ))}
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <svg className={styles.linkLayer} data-tool={activeTool}>
        {renderedLinks.map((item) => (
          <g key={item.link.id}>
            {item.selected ? (
              <path
                d={item.curve.d}
                className={styles.linkSelection}
                style={{
                  strokeWidth: item.link.width + 7,
                }}
              />
            ) : null}
            <path
              d={item.curve.d}
              className={styles.linkPath}
              style={{
                stroke: item.link.color,
                strokeWidth: item.link.width,
                strokeDasharray: item.link.dashed
                  ? "6 5"
                  : undefined,
              }}
            />
            {item.sourceArrow ? (
              <path
                d={item.sourceArrow}
                fill={item.link.color}
                className={styles.linkArrow}
              />
            ) : null}
            <path
              d={item.targetArrow}
              fill={item.link.color}
              className={styles.linkArrow}
            />
            <path
              d={item.curve.d}
              className={styles.linkHit}
              onPointerDown={(event) => {
                blurActiveEditableElement();
                event.preventDefault();
                event.stopPropagation();
                onSelectLink(item.link.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onSelectLink(item.link.id);
                setLinkMenu({
                  linkId: item.link.id,
                  x: Math.max(
                    8,
                    Math.min(event.clientX, window.innerWidth - 172),
                  ),
                  y: Math.max(
                    8,
                    Math.min(event.clientY, window.innerHeight - 60),
                  ),
                });
              }}
            >
              <title>
                {item.fromPage.name} → {item.toPage.name}
              </title>
            </path>
          </g>
        ))}

        {previewLink ? (
          <path
            d={previewLink.d}
            className={styles.linkPreview}
            style={{
              stroke: linkDrag?.targetId
                ? "var(--mf-accent)"
                : "var(--mf-text-tertiary)",
            }}
          />
        ) : null}
      </svg>

      {linkCursor ? (
        <div
          className={styles.linkCursor}
          style={{ left: linkCursor.x, top: linkCursor.y }}
          data-valid={linkCursor.valid}
          aria-hidden="true"
        >
          <span className={styles.linkCursorLabel}>
            {linkCursor.label}
          </span>
          <span className={styles.linkCursorPlus}>+</span>
        </div>
      ) : null}

      {snapGuides?.x !== null && snapGuides?.x !== undefined ? (
        <div
          className={styles.snapGuideVertical}
          style={{ left: snapGuides.x }}
          aria-hidden="true"
        />
      ) : null}

      {snapGuides?.y !== null && snapGuides?.y !== undefined ? (
        <div
          className={styles.snapGuideHorizontal}
          style={{ top: snapGuides.y }}
          aria-hidden="true"
        />
      ) : null}

      {marquee ? (
        <div
          className={styles.marquee}
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
          }}
          aria-hidden="true"
        />
      ) : null}

      {contextMenu
        ? createPortal(
            <div
              className={styles.contextMenu}
              style={{ left: contextMenu.x, top: contextMenu.y }}
              role="menu"
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              {contextMenu.kind === "page" && contextMenuPage ? (
                <>
                  {canRunContextPage ? (
                    <>
                      <button
                        className={styles.contextMenuItem}
                        type="button"
                        role="menuitem"
                        autoFocus
                        onClick={() => {
                          onRunPage(contextMenuPage.id);
                          setContextMenu(null);
                        }}
                      >
                        {t("projects.workspace.canvas.contextMenu.run")}
                      </button>
                      <div
                        className={styles.contextMenuSeparator}
                        role="separator"
                      />
                    </>
                  ) : null}
                  <button
                    className={styles.contextMenuItem}
                    type="button"
                    role="menuitem"
                    autoFocus={!canRunContextPage}
                    onClick={() => startPageRename(contextMenuPage)}
                  >
                    {t("projects.workspace.canvas.contextMenu.rename")}
                  </button>
                  <button
                    className={styles.contextMenuItem}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onCopyPage(contextMenuPage.id);
                      setContextMenu(null);
                    }}
                  >
                    {t("projects.workspace.canvas.contextMenu.copy")}
                  </button>
                  <button
                    className={styles.contextMenuItem}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onCutPage(contextMenuPage.id);
                      setContextMenu(null);
                    }}
                  >
                    {t("projects.workspace.canvas.contextMenu.cut")}
                  </button>
                  <button
                    className={styles.contextMenuItem}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onDuplicatePage(contextMenuPage.id);
                      setContextMenu(null);
                    }}
                  >
                    {t("projects.workspace.canvas.contextMenu.duplicate")}
                  </button>
                  <div
                    className={styles.contextMenuSeparator}
                    role="separator"
                  />
                  <button
                    className={styles.contextMenuItem}
                    type="button"
                    role="menuitem"
                    data-danger="true"
                    onClick={() => {
                      onDeletePage(contextMenuPage.id);
                      setContextMenu(null);
                    }}
                  >
                    {t("projects.workspace.canvas.contextMenu.delete")}
                  </button>
                </>
              ) : (
                <button
                  className={styles.contextMenuItem}
                  type="button"
                  role="menuitem"
                  autoFocus
                  disabled={!hasPageClipboard()}
                  onClick={() => {
                    onPastePage({
                      x: contextMenu.worldX,
                      y: contextMenu.worldY,
                    });
                    setContextMenu(null);
                  }}
                >
                  {t("projects.workspace.canvas.contextMenu.paste")}
                </button>
              )}
            </div>,
            document.body,
          )
        : null}

      {linkMenu
        ? createPortal(
            <div
              className={styles.contextMenu}
              style={{ left: linkMenu.x, top: linkMenu.y }}
              role="menu"
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") setLinkMenu(null);
              }}
            >
              <button
                className={styles.contextMenuItem}
                type="button"
                role="menuitem"
                data-danger="true"
                autoFocus
                onClick={() => {
                  onDeleteLink(linkMenu.linkId);
                  setLinkMenu(null);
                }}
              >
                {t("projects.workspace.canvas.contextMenu.delete")}
              </button>
            </div>,
            document.body,
          )
        : null}
    </main>
  );
}
