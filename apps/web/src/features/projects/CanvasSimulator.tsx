import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { getPageFrame } from "./canvasDocument";
import { CanvasNodeView, type CanvasNodeEventContext } from "./CanvasNodeView";
import {
  createRuntimeState,
  dispatchPageLoad,
  dispatchRuntimeEvent,
  getRuntimePage,
  type CanvasRuntimeState,
  type RuntimeSnapshot,
} from "./canvasRuntime";
import { remapControlStateEvent } from "./canvasControls";
import styles from "./CanvasSimulator.module.css";

const TITLE_BAR_HEIGHT = 34;
const MIN_WINDOW_WIDTH = 220;

function stabilizeRuntime(snapshot: RuntimeSnapshot, start: CanvasRuntimeState) {
  let state = start;
  let lastPageId: string | null = null;
  for (let index = 0; index < 8; index += 1) {
    if (state.currentPageId === lastPageId) break;
    lastPageId = state.currentPageId;
    state = dispatchPageLoad(snapshot, state, state.currentPageId);
  }
  return state;
}

export function CanvasSimulator({
  snapshot,
  dirty,
  compiling,
  compileProgress,
  onCompile,
  onClose,
}: {
  snapshot: RuntimeSnapshot;
  dirty: boolean;
  compiling: boolean;
  compileProgress: number;
  onCompile: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const container = getRuntimePage(snapshot, snapshot.containerId);
  const containerFrame = container
    ? getPageFrame(container, snapshot.pages, snapshot.links)
    : null;
  const containerSize = containerFrame
    ? { width: containerFrame.width, height: containerFrame.height }
    : { width: 430, height: 932 };
  const aspect =
    containerSize.width > 0 && containerSize.height > 0
      ? containerSize.width / containerSize.height
      : 430 / 932;
  const initialWidth = Math.min(
    430,
    Math.max(300, window.innerWidth * 0.26),
  );
  const [windowState, setWindowState] = useState(() => ({
    x: Math.max(24, (window.innerWidth - initialWidth) / 2),
    y: 80,
    width: initialWidth,
  }));
  const [runtime, setRuntime] = useState<CanvasRuntimeState>(() =>
    stabilizeRuntime(snapshot, createRuntimeState(snapshot)),
  );
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startWindowX: number;
    startWindowY: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    edge: string;
    startX: number;
    startY: number;
    startWidth: number;
    startWindowX: number;
    startWindowY: number;
  } | null>(null);

  useEffect(() => {
    setRuntime(stabilizeRuntime(snapshot, createRuntimeState(snapshot)));
  }, [snapshot.compiledAt]);

  const currentPage =
    getRuntimePage(snapshot, runtime.currentPageId) ?? container;
  const currentFrame = currentPage
    ? getPageFrame(currentPage, snapshot.pages, snapshot.links)
    : null;
  const currentSize = currentFrame
    ? { width: currentFrame.width, height: currentFrame.height }
    : containerSize;
  const scale = windowState.width / containerSize.width;
  const windowHeight = TITLE_BAR_HEIGHT + windowState.width / aspect;
  const bezel = container?.frame ? (container.frame === "watch" ? 8 : 9) : 0;
  const screenDesignWidth = Math.max(1, containerSize.width - bezel * 2);
  const screenDesignHeight = Math.max(1, containerSize.height - bezel * 2);
  const contentScale = currentPage
    ? Math.min(
        screenDesignWidth / Math.max(1, currentSize.width),
        screenDesignHeight / Math.max(1, currentSize.height),
      )
    : 1;
  const contentLeft =
    (screenDesignWidth - currentSize.width * contentScale) / 2;
  const contentTop =
    (screenDesignHeight - currentSize.height * contentScale) / 2;

  const handleRuntimeEvent = (
    nodeId: string,
    event: string,
    context?: CanvasNodeEventContext,
  ) => {
    setRuntime((current) => {
      let next = dispatchRuntimeEvent(
        snapshot,
        current,
        nodeId,
        event,
        context?.controlScope,
      );
      if (context?.controlScope) {
        next = remapControlStateEvent(
          snapshot.pages,
          current,
          next,
          context.controlScope,
        );
      }
      if (next.currentPageId !== current.currentPageId) {
        return stabilizeRuntime(snapshot, next);
      }
      return next;
    });
  };

  const startMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWindowX: windowState.x,
      startWindowY: windowState.y,
    };
  };

  const moveWindow = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setWindowState((current) => ({
      ...current,
      x: Math.min(
        Math.max(-window.innerWidth + 120, drag.startWindowX + event.clientX - drag.startX),
        window.innerWidth - 120,
      ),
      y: Math.min(
        Math.max(0, drag.startWindowY + event.clientY - drag.startY),
        window.innerHeight - 80,
      ),
    }));
  };

  const endMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const startResize = (
    event: ReactPointerEvent<HTMLSpanElement>,
    edge: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: windowState.width,
      startWindowX: windowState.x,
      startWindowY: windowState.y,
    };
  };

  const resizeWindow = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const dx = event.clientX - resize.startX;
    const dy = event.clientY - resize.startY;
    const horizontal =
      resize.edge.includes("e")
        ? dx
        : resize.edge.includes("w")
          ? -dx
          : 0;
    const vertical =
      resize.edge.includes("s")
        ? dy * aspect
        : resize.edge.includes("n")
          ? -dy * aspect
          : 0;
    const delta =
      Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
    const maxWidth = Math.min(window.innerWidth * 0.9, 900);
    const nextWidth = Math.min(
      maxWidth,
      Math.max(MIN_WINDOW_WIDTH, resize.startWidth + delta),
    );
    setWindowState((current) => {
      const widthDelta = nextWidth - resize.startWidth;
      return {
        width: nextWidth,
        x: resize.edge.includes("w")
          ? resize.startWindowX - widthDelta
          : current.x,
        y: resize.edge.includes("n")
          ? resize.startWindowY - widthDelta / aspect
          : current.y,
      };
    });
  };

  const endResize = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (!container || !currentPage) return null;

  return createPortal(
    <div
      className={styles.window}
      style={{
        left: windowState.x,
        top: windowState.y,
        width: windowState.width,
        height: windowHeight,
      }}
      data-compiling={compiling}
    >
      <div
        className={styles.titleBar}
        onPointerDown={startMove}
        onPointerMove={moveWindow}
        onPointerUp={endMove}
        onPointerCancel={endMove}
        onLostPointerCapture={endMove}
      >
        <div className={styles.titleGroup}>
          <span className={styles.titleDot} />
          <span className={styles.titleText}>{container.name}</span>
          {dirty ? (
            <span className={styles.dirtyBadge}>
              {t("projects.workspace.simulator.dirty")}
            </span>
          ) : null}
        </div>
        <div className={styles.titleActions}>
          <button
            className={styles.compileButton}
            type="button"
            disabled={compiling}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onCompile}
          >
            {compiling
              ? t("projects.workspace.simulator.compiling", {
                  progress: compileProgress,
                })
              : t("projects.workspace.simulator.compile")}
          </button>
          <button
            className={styles.closeButton}
            type="button"
            aria-label={t("projects.workspace.simulator.close")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>

      <div className={styles.deviceViewport}>
        <div
          className={styles.deviceScaler}
          style={{
            width: containerSize.width,
            height: containerSize.height,
            transform: `scale(${scale})`,
          }}
        >
          <div
            className={styles.device}
            data-frame={container.frame ?? "none"}
          >
            <div className={styles.deviceScreen}>
              <div
                className={styles.pageScaler}
                style={{
                  width: currentSize.width,
                  height: currentSize.height,
                  left: contentLeft,
                  top: contentTop,
                  transform: `scale(${contentScale})`,
                }}
              >
                <CanvasNodeView
                  page={currentPage}
                  pages={snapshot.pages}
                  links={snapshot.links}
                  root
                  runtime={runtime}
                  projectBehavior={snapshot.behavior}
                  onEvent={handleRuntimeEvent}
                  maxDepth={8}
                />
              </div>
            </div>
            {container.frame === "iphone" ? (
              <span className={styles.notch} />
            ) : null}
            {container.frame === "android" ? (
              <span className={styles.camera} />
            ) : null}
            {container.frame === "watch" ? (
              <span className={styles.crown} />
            ) : null}
          </div>
        </div>
      </div>

      {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((edge) => (
        <span
          key={edge}
          className={styles.resizeHandle}
          data-edge={edge}
          onPointerDown={(event) => startResize(event, edge)}
          onPointerMove={resizeWindow}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onLostPointerCapture={endResize}
        />
      ))}
    </div>,
    document.body,
  );
}
