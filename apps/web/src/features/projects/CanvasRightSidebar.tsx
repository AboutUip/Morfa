import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { LayersIcon, SlidersIcon } from "../../components/icons";
import styles from "./CanvasRightSidebar.module.css";

const DEFAULT_PANEL_WIDTH = 240;
const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = 420;
const RESIZE_STEP = 16;
const PANEL_ANIMATION_MS = 200;
const PANEL_ID = "canvas-inspector-panel";

type RightPanel = "layers" | "properties";

const PANEL_ITEMS = [
  { id: "layers", Icon: LayersIcon },
  { id: "properties", Icon: SlidersIcon },
] as const;

const PANEL_LABEL_KEYS: Record<RightPanel, string> = {
  layers: "projects.workspace.rightPanels.layers",
  properties: "projects.workspace.rightPanels.properties",
};

interface ResizeSession {
  pointerId: number;
  startX: number;
  startWidth: number;
}

function clampWidth(width: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

export function CanvasRightSidebar() {
  const { t } = useTranslation();
  const [activePanel, setActivePanel] = useState<RightPanel | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<ResizeSession | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const openFramesRef = useRef<number[]>([]);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const clearOpenFrames = () => {
    for (const frame of openFramesRef.current) {
      cancelAnimationFrame(frame);
    }
    openFramesRef.current = [];
  };

  const reduceMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const expandPanel = () => {
    if (reduceMotion()) {
      setPanelExpanded(true);
      return;
    }

    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        setPanelExpanded(true);
        openFramesRef.current = [];
      });
      openFramesRef.current.push(secondFrame);
    });
    openFramesRef.current.push(firstFrame);
  };

  const handlePanelSelect = (panel: RightPanel) => {
    if (activePanel === panel) {
      if (!panelExpanded) {
        clearCloseTimer();
        setPanelExpanded(true);
        return;
      }

      clearOpenFrames();
      clearCloseTimer();
      setPanelExpanded(false);

      if (reduceMotion()) {
        setActivePanel(null);
        return;
      }

      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setActivePanel(null);
      }, PANEL_ANIMATION_MS);
      return;
    }

    clearCloseTimer();
    clearOpenFrames();

    if (activePanel === null) {
      setActivePanel(panel);
      setPanelExpanded(false);
      expandPanel();
      return;
    }

    setActivePanel(panel);
    setPanelExpanded(true);
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
      clearOpenFrames();
    };
  }, []);

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeRef.current = null;
    setResizing(false);
  };

  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelWidth,
    };
    setResizing(true);
  };

  const handleResizePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    setPanelWidth(
      clampWidth(resize.startWidth - (event.clientX - resize.startX)),
    );
  };

  const handleResizeLostCapture = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    setResizing(false);
  };

  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? RESIZE_STEP : -RESIZE_STEP;
    setPanelWidth((width) => clampWidth(width + delta));
  };

  return (
    <div className={styles.dock}>
      {activePanel ? (
        <div
          className={styles.panelViewport}
          style={{ width: panelExpanded ? panelWidth : 0 }}
          data-expanded={panelExpanded}
          data-resizing={resizing}
        >
          <aside
            id={PANEL_ID}
            className={styles.panel}
            style={{ width: panelWidth }}
            data-resizing={resizing}
            data-panel={activePanel}
            aria-label={t(PANEL_LABEL_KEYS[activePanel])}
          >
            <div className={styles.panelHeader}>
              {t(PANEL_LABEL_KEYS[activePanel])}
            </div>
            <div className={styles.panelBody} />

            <div
              className={styles.resizeHandle}
              role="separator"
              aria-orientation="vertical"
              aria-label={t("projects.workspace.sidebarPanels.resize")}
              aria-valuemin={MIN_PANEL_WIDTH}
              aria-valuemax={MAX_PANEL_WIDTH}
              aria-valuenow={panelWidth}
              tabIndex={0}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onLostPointerCapture={handleResizeLostCapture}
              onKeyDown={handleResizeKeyDown}
            />
          </aside>
        </div>
      ) : null}

      <aside
        className={styles.rail}
        aria-label={t("projects.workspace.inspector")}
      >
        {PANEL_ITEMS.map(({ id, Icon }) => {
          const isOpen = activePanel === id;
          const label = t(PANEL_LABEL_KEYS[id]);

          return (
            <button
              key={id}
              className={styles.railItem}
              type="button"
              title={label}
              aria-label={label}
              aria-expanded={isOpen}
              aria-controls={isOpen ? PANEL_ID : undefined}
              data-active={isOpen}
              onClick={() => handlePanelSelect(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          );
        })}
      </aside>
    </div>
  );
}
