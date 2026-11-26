import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";

import type { CanvasTool } from "./canvasTools";
import {
  createPageId,
  createPageStyles,
  getPageSize,
  uniquePageName,
  type CanvasPage,
} from "./canvasDocument";
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

interface CanvasViewportProps {
  label: string;
  activeTool: CanvasTool;
  pages: CanvasPage[];
  selectedId: string | null;
  onSelectPage: (pageId: string | null) => void;
  onCreatePage: (page: CanvasPage) => void;
  onMovePage: (pageId: string, x: number, y: number) => void;
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

function findPageAt(
  pages: CanvasPage[],
  worldX: number,
  worldY: number,
) {
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pages[index];
    const { width, height } = getPageSize(page);

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
  onSelectPage,
  onCreatePage,
  onMovePage,
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
  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

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
      setMovingPage(true);
      setHoveringPage(true);
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

      onMovePage(
        move.pageId,
        move.startX + (worldX - move.startWorldX),
        move.startY + (worldY - move.startWorldY),
      );
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
    setMovingPage(false);
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
      setMovingPage(false);
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
      id: createPageId(),
      name: uniquePageName(t(item.nameKey), pages),
      x: worldX,
      y: worldY,
      styles: createPageStyles(),
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
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={styles.grid} style={gridStyle} aria-hidden="true" />
      <div className={styles.world} style={worldStyle} aria-hidden="true">
        {pages.map((page) => {
          const {
            width = "800px",
            height = "800px",
            ...surfaceStyles
          } = page.styles;

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
              <span
                className={styles.pageLabel}
                style={{ transform: `scale(${1 / view.zoom})` }}
              >
                {page.name}
              </span>
              <div
                className={styles.pageSurface}
                style={toReactStyle(surfaceStyles)}
              />
            </div>
          );
        })}
      </div>

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
    </main>
  );
}
