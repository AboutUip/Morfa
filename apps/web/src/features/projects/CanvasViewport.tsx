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

import { hasPageClipboard } from "./canvasClipboard";
import type { CanvasTool } from "./canvasTools";
import {
  createPageId,
  createPageStyles,
  getPageSize,
  isPageSeeThrough,
  resolveStyleVariables,
  uniquePageName,
  type CanvasPage,
} from "./canvasDocument";
import {
  DEFAULT_CANVAS_SNAP_SETTINGS,
  type CanvasSnapSettings,
} from "./canvasSnap";
import {
  CONTAINER_DRAG_MIME,
  getMarketContainer,
} from "./componentMarket";
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

interface MoveSession {
  pointerId: number;
  pageId: string;
  startWorldX: number;
  startWorldY: number;
  startX: number;
  startY: number;
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

interface CanvasViewportProps {
  label: string;
  activeTool: CanvasTool;
  pages: CanvasPage[];
  selectedId: string | null;
  snapSettings?: CanvasSnapSettings;
  onSelectPage: (pageId: string | null) => void;
  onCreatePage: (page: CanvasPage) => void;
  onMovePage: (pageId: string, x: number, y: number) => void;
  onMovePageStart: () => void;
  onMovePageEnd: () => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (pageId: string) => void;
  onCopyPage: (pageId: string) => void;
  onCutPage: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onPastePage: (position?: { x: number; y: number }) => void;
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

function findPageAt(
  pages: CanvasPage[],
  worldX: number,
  worldY: number,
) {
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index];
    const { width, height } = getPageSize(page, pages);

    if (
      worldX >= page.x &&
      worldX <= page.x + width &&
      worldY >= page.y &&
      worldY <= page.y + height
    ) {
      return page;
    }
  }

  return null;
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

function resolvePageSnap(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  pages: CanvasPage[];
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
    movingId,
    view,
    viewportWidth,
    viewportHeight,
    settings = DEFAULT_CANVAS_SNAP_SETTINGS,
  } = input;

  if (!settings.enabled) {
    return { x, y, guides: null };
  }

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
      if (page.id === movingId) continue;
      const size = getPageSize(page, pages);
      addLine(xLines, page.x);
      addLine(xLines, page.x + size.width / 2);
      addLine(xLines, page.x + size.width);
      addLine(yLines, page.y);
      addLine(yLines, page.y + size.height / 2);
      addLine(yLines, page.y + size.height);
    }
  }

  if (settings.grid) {
    const step = resolveGridStep(view.zoom);
    for (const anchor of [x, x + width / 2, x + width]) {
      addLine(xLines, Math.round(anchor / step) * step);
    }
    for (const anchor of [y, y + height / 2, y + height]) {
      addLine(yLines, Math.round(anchor / step) * step);
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
  selectedId,
  snapSettings = DEFAULT_CANVAS_SNAP_SETTINGS,
  onSelectPage,
  onCreatePage,
  onMovePage,
  onMovePageStart,
  onMovePageEnd,
  onRenamePage,
  onDeletePage,
  onCopyPage,
  onCutPage,
  onDuplicatePage,
  onPastePage,
}: CanvasViewportProps) {
  const { t } = useTranslation();
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
  const gestureRef = useRef<GestureSession | null>(null);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [movingPage, setMovingPage] = useState(false);
  const [hoveringPage, setHoveringPage] = useState(false);
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
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      (activeElement.isContentEditable ||
        activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.tagName === "SELECT")
    ) {
      // 画布会阻止 pointerdown 的默认行为，需要主动让属性输入框失焦并提交。
      activeElement.blur();
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

    if (event.button !== 0 || activeTool !== "select") return;

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const currentView = viewRef.current;
    const worldX = (x - currentView.x) / currentView.zoom;
    const worldY = (y - currentView.y) / currentView.zoom;
    const hit = findPageAt(pages, worldX, worldY);

    onSelectPage(hit?.id ?? null);
    if (hit) {
      event.currentTarget.setPointerCapture(event.pointerId);
      moveRef.current = {
        pointerId: event.pointerId,
        pageId: hit.id,
        startWorldX: worldX,
        startWorldY: worldY,
        startX: hit.x,
        startY: hit.y,
      };
      onMovePageStart();
      setMovingPage(true);
      setHoveringPage(true);
      setSnapGuides(null);
      return;
    }

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
      const rect = event.currentTarget.getBoundingClientRect();
      const currentView = viewRef.current;
      const worldX =
        (event.clientX - rect.left - currentView.x) / currentView.zoom;
      const worldY =
        (event.clientY - rect.top - currentView.y) / currentView.zoom;
      const rawX = move.startX + (worldX - move.startWorldX);
      const rawY = move.startY + (worldY - move.startWorldY);
      const movingPage = pages.find((page) => page.id === move.pageId);

      if (!movingPage) {
        onMovePage(move.pageId, rawX, rawY);
        setSnapGuides(null);
        return;
      }

      const size = getPageSize(movingPage, pages);
      const resolution = resolvePageSnap({
        x: rawX,
        y: rawY,
        width: size.width,
        height: size.height,
        pages,
        movingId: move.pageId,
        view: currentView,
        viewportWidth: event.currentTarget.clientWidth,
        viewportHeight: event.currentTarget.clientHeight,
        settings: snapSettings,
      });

      onMovePage(move.pageId, resolution.x, resolution.y);
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

    if (activeTool === "select") {
      const rect = event.currentTarget.getBoundingClientRect();
      const currentView = viewRef.current;
      const worldX =
        (event.clientX - rect.left - currentView.x) / currentView.zoom;
      const worldY =
        (event.clientY - rect.top - currentView.y) / currentView.zoom;
      setHoveringPage(Boolean(findPageAt(pages, worldX, worldY)));
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
  };

  const endMove = (event: ReactPointerEvent<HTMLElement>) => {
    const move = moveRef.current;
    if (!move || move.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    moveRef.current = null;
    onMovePageEnd();
    setMovingPage(false);
    setSnapGuides(null);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
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
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      setPanning(false);
    }

    if (moveRef.current?.pointerId === event.pointerId) {
      moveRef.current = null;
      onMovePageEnd();
      setMovingPage(false);
      setSnapGuides(null);
    }

    if (marqueeRef.current?.pointerId === event.pointerId) {
      marqueeRef.current = null;
      setMarquee(null);
    }
  };

  const handlePointerLeave = () => {
    if (!panRef.current && !moveRef.current && !marqueeRef.current) {
      setHoveringPage(false);
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
    const hit = findPageAt(pages, worldX, worldY);
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
    if (
      !Array.from(event.dataTransfer.types).includes(CONTAINER_DRAG_MIME)
    ) {
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
    const containerId = event.dataTransfer.getData(CONTAINER_DRAG_MIME);
    if (!containerId) return;

    event.preventDefault();
    setDropActive(false);

    const item = getMarketContainer(containerId);
    if (!item) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const currentView = viewRef.current;
    const worldX =
      (event.clientX - rect.left - currentView.x) / currentView.zoom;
    const worldY =
      (event.clientY - rect.top - currentView.y) / currentView.zoom;
    const page: CanvasPage = {
      id: createPageId(pages),
      name: uniquePageName(t(item.nameKey), pages),
      x: worldX,
      y: worldY,
      styles: {
        ...createPageStyles(),
        width: `${item.width}px`,
        height: `${item.height}px`,
      },
      ...(item.frame ? { frame: item.frame } : {}),
      ...(item.lockedSize ? { lockedSize: true } : {}),
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
      data-hover-page={hoveringPage}
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
          );
          const {
            width = "800px",
            height = "800px",
            ...surfaceStyles
          } = resolvedStyles;
          const seeThrough = isPageSeeThrough(page);
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
              data-selected={selectedId === page.id}
              style={{
                left: page.x,
                top: page.y,
                width,
                height,
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
              ) : (
                <span
                  className={styles.pageLabel}
                  style={{ transform: `scale(${1 / view.zoom})` }}
                >
                  {page.name}
                </span>
              )}

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
            </div>
          );
        })}
      </div>

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
                  <button
                    className={styles.contextMenuItem}
                    type="button"
                    role="menuitem"
                    autoFocus
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
    </main>
  );
}
