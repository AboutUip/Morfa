import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { CursorIcon, HandIcon, ToolsIcon } from "../../components/icons";
import {
  CANVAS_TOOL_SHORTCUTS,
  type CanvasTool,
} from "./canvasTools";
import styles from "./CanvasLeftSidebar.module.css";

const DEFAULT_PANEL_WIDTH = 240;
const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = 420;
const RESIZE_STEP = 16;
const PANEL_ID = "canvas-tools-panel";

interface CanvasLeftSidebarProps {
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
}

interface ResizeSession {
  pointerId: number;
  startX: number;
  startWidth: number;
}

function clampWidth(width: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

export function CanvasLeftSidebar({
  activeTool,
  onToolChange,
}: CanvasLeftSidebarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<ResizeSession | null>(null);

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
      clampWidth(resize.startWidth + event.clientX - resize.startX),
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
    const delta = event.key === "ArrowRight" ? RESIZE_STEP : -RESIZE_STEP;
    setPanelWidth((width) => clampWidth(width + delta));
  };

  return (
    <div className={styles.dock}>
      <aside
        className={styles.rail}
        aria-label={t("projects.workspace.sidebar")}
      >
        <button
          className={styles.railItem}
          type="button"
          title={t("projects.workspace.tools.title")}
          aria-label={t("projects.workspace.tools.title")}
          aria-expanded={open}
          aria-controls={open ? PANEL_ID : undefined}
          data-active={open}
          onClick={() => setOpen((current) => !current)}
        >
          <ToolsIcon size={18} />
          <span>{t("projects.workspace.tools.title")}</span>
        </button>
      </aside>

      {open ? (
        <aside
          id={PANEL_ID}
          className={styles.panel}
          style={{ width: panelWidth }}
          data-resizing={resizing}
          aria-label={t("projects.workspace.tools.panel")}
        >
          <div className={styles.panelHeader}>
            {t("projects.workspace.tools.title")}
          </div>

          <div
            className={styles.toolList}
            role="group"
            aria-label={t("projects.workspace.tools.panel")}
          >
            <button
              className={styles.toolItem}
              type="button"
              data-active={activeTool === "select"}
              aria-pressed={activeTool === "select"}
              onClick={() => onToolChange("select")}
            >
              <CursorIcon size={15} />
              <span className={styles.toolLabel}>
                {t("projects.workspace.tools.select")}
              </span>
              <span className={styles.shortcut}>
                ({CANVAS_TOOL_SHORTCUTS.select})
              </span>
            </button>

            <button
              className={styles.toolItem}
              type="button"
              data-active={activeTool === "hand"}
              aria-pressed={activeTool === "hand"}
              onClick={() => onToolChange("hand")}
            >
              <HandIcon size={15} />
              <span className={styles.toolLabel}>
                {t("projects.workspace.tools.hand")}
              </span>
              <span className={styles.shortcut}>
                ({CANVAS_TOOL_SHORTCUTS.hand})
              </span>
            </button>
          </div>

          <div
            className={styles.resizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("projects.workspace.tools.resize")}
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
      ) : null}
    </div>
  );
}
