import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import styles from "./CanvasViewport.module.css";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const BASE_GRID = 24;
const MIN_GRID_SCREEN = 12;
const MAX_GRID_SCREEN = 72;
const MAJOR_GRID_CELLS = 5;
const ZOOM_SENSITIVITY = 0.0015;

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

interface GestureSession {
  view: CanvasView;
  px: number;
  py: number;
}

interface CanvasViewportProps {
  label: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

export function CanvasViewport({ label }: CanvasViewportProps) {
  const viewportRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<CanvasView>({
    x: 0,
    y: 0,
    zoom: 1,
  });
  const viewRef = useRef(view);
  const panRef = useRef<PanSession | null>(null);
  const gestureRef = useRef<GestureSession | null>(null);
  const [panning, setPanning] = useState(false);

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
    // 左键暂时不绑定任何画布交互；中键用于拖拽平移视图。
    if (event.button !== 1) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setPanning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

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

  const handleLostPointerCapture = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setPanning(false);
  };

  const handleMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button === 1) event.preventDefault();
  };

  const handleAuxClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.button === 1) event.preventDefault();
  };

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
      data-panning={panning}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onLostPointerCapture={handleLostPointerCapture}
      onMouseDown={handleMouseDown}
      onAuxClick={handleAuxClick}
    >
      <div className={styles.grid} style={gridStyle} aria-hidden="true" />
      <div className={styles.world} style={worldStyle} aria-hidden="true" />
    </main>
  );
}
