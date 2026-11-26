import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";

import {
  CursorIcon,
  FrameIcon,
  HandIcon,
  LayersIcon,
  SearchIcon,
  ToolsIcon,
} from "../../components/icons";
import type { ProjectType } from "../../lib/api";
import {
  CANVAS_TOOL_SHORTCUTS,
  type CanvasTool,
} from "./canvasTools";
import {
  CONTAINER_DRAG_MIME,
  CONTAINER_MARKET,
  type MarketContainer,
} from "./componentMarket";
import styles from "./CanvasLeftSidebar.module.css";

const DEFAULT_PANEL_WIDTH = 240;
const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = 420;
const RESIZE_STEP = 16;
const PANEL_ANIMATION_MS = 200;
const PANEL_ID = "canvas-side-panel";

type SidePanel = "tools" | "components" | "canvas";

const PANEL_LABEL_KEYS: Record<SidePanel, string> = {
  tools: "projects.workspace.sidebarPanels.tools",
  components: "projects.workspace.sidebarPanels.components",
  canvas: "projects.workspace.sidebarPanels.canvas",
};

const PANEL_ITEMS = [
  { id: "tools", Icon: ToolsIcon },
  { id: "components", Icon: LayersIcon },
  { id: "canvas", Icon: FrameIcon },
] as const;

interface CanvasLeftSidebarProps {
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  projectType: ProjectType;
}

type ComponentTab = "mine" | "market";

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
  projectType,
}: CanvasLeftSidebarProps) {
  const { t } = useTranslation();
  const [activePanel, setActivePanel] = useState<SidePanel | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [componentTab, setComponentTab] =
    useState<ComponentTab>("market");
  const [marketQuery, setMarketQuery] = useState("");
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

  const handlePanelSelect = (panel: SidePanel) => {
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

  const marketItems = useMemo(() => {
    const query = marketQuery.trim().toLowerCase();

    return CONTAINER_MARKET.filter((item) => {
      if (item.target !== "both" && item.target !== projectType) {
        return false;
      }
      if (!query) return true;

      return (
        t(item.nameKey).toLowerCase().includes(query) ||
        t(item.descriptionKey).toLowerCase().includes(query)
      );
    });
  }, [marketQuery, projectType, t]);

  const handleMarketDragStart = (
    event: ReactDragEvent<HTMLDivElement>,
    item: MarketContainer,
  ) => {
    event.dataTransfer.setData(CONTAINER_DRAG_MIME, item.id);
    event.dataTransfer.setData("text/plain", t(item.nameKey));
    event.dataTransfer.effectAllowed = "copy";
  };

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
          {activePanel === "components" ? (
            <div className={styles.componentsPanel}>
              <div
                className={styles.panelTabs}
                role="tablist"
                aria-label={t(PANEL_LABEL_KEYS.components)}
              >
                <button
                  className={styles.panelTab}
                  id="components-tab-mine"
                  type="button"
                  role="tab"
                  aria-selected={componentTab === "mine"}
                  aria-controls="components-panel-mine"
                  data-active={componentTab === "mine"}
                  onClick={() => setComponentTab("mine")}
                >
                  {t("projects.workspace.componentsPanel.tabs.mine")}
                </button>
                <button
                  className={styles.panelTab}
                  id="components-tab-market"
                  type="button"
                  role="tab"
                  aria-selected={componentTab === "market"}
                  aria-controls="components-panel-market"
                  data-active={componentTab === "market"}
                  onClick={() => setComponentTab("market")}
                >
                  {t("projects.workspace.componentsPanel.tabs.market")}
                </button>
              </div>

              {componentTab === "market" ? (
                <div
                  className={styles.marketPanel}
                  id="components-panel-market"
                  role="tabpanel"
                  aria-labelledby="components-tab-market"
                >
                  <label className={styles.searchBox}>
                    <SearchIcon size={13} />
                    <input
                      className={styles.searchInput}
                      type="search"
                      value={marketQuery}
                      onChange={(event) =>
                        setMarketQuery(event.target.value)
                      }
                      placeholder={t(
                        "projects.workspace.componentsPanel.searchPlaceholder",
                      )}
                      aria-label={t(
                        "projects.workspace.componentsPanel.searchPlaceholder",
                      )}
                    />
                  </label>

                  <div className={styles.marketGrid} role="list">
                    {marketItems.length > 0 ? (
                      marketItems.map((item) => (
                        <div
                          key={item.id}
                          className={styles.marketCard}
                          role="listitem"
                          draggable
                          onDragStart={(event) =>
                            handleMarketDragStart(event, item)
                          }
                        >
                          <span
                            className={styles.marketCover}
                            aria-hidden="true"
                          >
                            <span className={styles.marketCoverCanvas}>
                              <FrameIcon size={18} />
                            </span>
                          </span>
                          <span className={styles.marketName}>
                            {t(item.nameKey)}
                          </span>
                          <span className={styles.marketDescription}>
                            {t(item.descriptionKey)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className={styles.noResults}>
                        {t("projects.workspace.componentsPanel.noResults")}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className={styles.minePanel}
                  id="components-panel-mine"
                  role="tabpanel"
                  aria-labelledby="components-tab-mine"
                />
              )}
            </div>
          ) : (
            <div className={styles.panelHeader}>
              {t(PANEL_LABEL_KEYS[activePanel])}
            </div>
          )}

          {activePanel === "tools" ? (
            <div
              className={styles.toolList}
              role="group"
              aria-label={t(PANEL_LABEL_KEYS.tools)}
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
          ) : null}

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
    </div>
  );
}
