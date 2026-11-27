import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import type {
  CanvasBehaviorBlock,
  CanvasBehaviorEdge,
  CanvasBehaviorState,
  CanvasPage,
} from "./canvasDocument";
import {
  BEHAVIOR_CONDITION_SOURCES,
  behaviorActionLabelKey,
  behaviorEventLabelKey,
} from "./canvasBehavior";
import styles from "./BehaviorGraphCanvas.module.css";

export const BEHAVIOR_GRAPH_NODE_WIDTH = 208;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

const BLOCK_HEIGHT: Record<CanvasBehaviorBlock["type"], number> = {
  event: 78,
  condition: 94,
  action: 94,
  note: 106,
};

const EDITOR_NODE_WIDTH = 300;
const EDITOR_NODE_HEIGHT: Record<
  CanvasBehaviorBlock["type"],
  number
> = {
  event: 230,
  condition: 430,
  action: 430,
  note: 260,
};

const STATE_WIDTH = 178;
const STATE_HEIGHT = 62;
const STATE_EDITOR_WIDTH = 250;
const STATE_EDITOR_HEIGHT = 180;

interface GraphNode {
  id: string;
  kind: "block" | "state";
  x: number;
  y: number;
  width: number;
  height: number;
  block?: CanvasBehaviorBlock;
  state?: CanvasBehaviorState;
}

interface CanvasView {
  x: number;
  y: number;
  zoom: number;
}

interface PanSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
}

interface NodeDragSession {
  pointerId: number;
  id: string;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  moved: boolean;
}

interface ConnectionSession {
  pointerId: number;
  from: string;
  startClientX: number;
  startClientY: number;
  cursorX: number;
  cursorY: number;
  dragging: boolean;
}

export interface BehaviorGraphCanvasApi {
  getViewportCenter: () => { x: number; y: number };
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value);
}

export function BehaviorGraphCanvas({
  pages,
  blocks,
  edges,
  states,
  selectedNodeId,
  selectedEdgeId,
  fitKey,
  apiRef,
  onSelectNode,
  onSelectEdge,
  onMoveNode,
  onCreateEdge,
  onDeleteEdge,
  onDeleteNode,
  renderBlockEditor,
  renderStateEditor,
}: {
  pages: CanvasPage[];
  blocks: CanvasBehaviorBlock[];
  edges: CanvasBehaviorEdge[];
  states: CanvasBehaviorState[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  fitKey?: string;
  apiRef?: { current: BehaviorGraphCanvasApi | null };
  onSelectNode: (id: string | null) => void;
  onSelectEdge: (id: string | null) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onCreateEdge: (from: string, to: string) => void;
  onDeleteEdge: (id: string) => void;
  onDeleteNode: (id: string) => void;
  renderBlockEditor?: (block: CanvasBehaviorBlock) => ReactNode;
  renderStateEditor?: (state: CanvasBehaviorState) => ReactNode;
}) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<CanvasView>({
    x: 48,
    y: 36,
    zoom: 1,
  });
  const viewRef = useRef(view);
  const [panning, setPanning] = useState(false);
  const panRef = useRef<PanSession | null>(null);
  const [drag, setDrag] = useState<NodeDragSession | null>(null);
  const dragRef = useRef<NodeDragSession | null>(null);
  const [connection, setConnection] = useState<ConnectionSession | null>(
    null,
  );
  const connectionRef = useRef<ConnectionSession | null>(null);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
    edgeId?: string;
  } | null>(null);
  const lastFitKeyRef = useRef<string | null>(null);
  const markerBase = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const arrowId = `morfa-behavior-arrow-${markerBase}`;
  const selectedArrowId = `morfa-behavior-arrow-selected-${markerBase}`;

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const pagesById = useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  );

  const baseNodes = useMemo<GraphNode[]>(() => {
    const blockNodes = blocks.map((block) => {
      const editing = block.id === selectedNodeId;
      return {
        id: block.id,
        kind: "block" as const,
        x: block.x,
        y: block.y,
        width: editing ? EDITOR_NODE_WIDTH : BEHAVIOR_GRAPH_NODE_WIDTH,
        height: editing
          ? EDITOR_NODE_HEIGHT[block.type]
          : BLOCK_HEIGHT[block.type],
        block,
      };
    });
    const stateNodes = states.map((state, index) => {
      const editing = state.id === selectedNodeId;
      return {
        id: state.id,
        kind: "state" as const,
        x: state.x ?? 96 + index * 228,
        y: state.y ?? 32,
        width: editing ? STATE_EDITOR_WIDTH : STATE_WIDTH,
        height: editing ? STATE_EDITOR_HEIGHT : STATE_HEIGHT,
        state,
      };
    });
    return [...stateNodes, ...blockNodes];
  }, [blocks, selectedNodeId, states]);

  const renderNodes = useMemo(() => {
    if (!drag) return baseNodes;
    return baseNodes.map((node) =>
      node.id === drag.id ? { ...node, x: drag.x, y: drag.y } : node,
    );
  }, [baseNodes, drag]);

  const nodeMap = useMemo(
    () => new Map(renderNodes.map((node) => [node.id, node])),
    [renderNodes],
  );

  const openContextMenu = (
    event: ReactMouseEvent,
    target: { nodeId?: string; edgeId?: string } = {},
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    setContextMenu({
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
      ...target,
    });
  };

  const fitView = () => {
    const element = viewportRef.current;
    if (!element) return;
    if (renderNodes.length === 0) {
      setView({ x: 48, y: 36, zoom: 1 });
      return;
    }

    const padding = 56;
    const minX = Math.min(...renderNodes.map((node) => node.x));
    const minY = Math.min(...renderNodes.map((node) => node.y));
    const maxX = Math.max(
      ...renderNodes.map((node) => node.x + node.width),
    );
    const maxY = Math.max(
      ...renderNodes.map((node) => node.y + node.height),
    );
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const availableWidth = Math.max(120, element.clientWidth - padding * 2);
    const availableHeight = Math.max(120, element.clientHeight - padding * 2);
    const zoom = clamp(
      Math.min(availableWidth / width, availableHeight / height, 1.2),
      MIN_ZOOM,
      MAX_ZOOM,
    );

    setView({
      x: (element.clientWidth - width * zoom) / 2 - minX * zoom,
      y: (element.clientHeight - height * zoom) / 2 - minY * zoom,
      zoom,
    });
  };

  const zoomBy = (factor: number) => {
    const element = viewportRef.current;
    if (!element) return;
    const px = element.clientWidth / 2;
    const py = element.clientHeight / 2;
    setView((current) => {
      const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
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

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      getViewportCenter: () => {
        const element = viewportRef.current;
        const current = viewRef.current;
        if (!element) return { x: 160, y: 140 };
        return {
          x: (element.clientWidth / 2 - current.x) / current.zoom,
          y: (element.clientHeight / 2 - current.y) / current.zoom,
        };
      },
      fitView,
      zoomIn: () => zoomBy(1.2),
      zoomOut: () => zoomBy(1 / 1.2),
    };
    return () => {
      if (apiRef) apiRef.current = null;
    };
  });

  useEffect(() => {
    if (!fitKey || fitKey === lastFitKeyRef.current) return;
    lastFitKeyRef.current = fitKey;
    fitView();
  });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const delta =
        event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(-delta * 0.0016);
      if (factor === 1) return;

      setView((current) => {
        const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
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

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const isInteractive = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(
        element?.closest(
          "input, textarea, select, button, a, [contenteditable='true'], [role='button']",
        ),
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isInteractive(event.target)) return;
      event.preventDefault();
      spaceRef.current = true;
      setSpaceHeld(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    const handleBlur = () => {
      spaceRef.current = false;
      setSpaceHeld(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    connectionRef.current = null;
    setConnection(null);
    setPendingFrom(null);
  }, [blocks, edges, states]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      connectionRef.current = null;
      setConnection(null);
      setPendingFrom(null);
      setContextMenu(null);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () =>
      window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const clientToWorld = (clientX: number, clientY: number) => {
    const element = viewportRef.current;
    const current = viewRef.current;
    if (!element) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    return {
      x: (clientX - rect.left - current.x) / current.zoom,
      y: (clientY - rect.top - current.y) / current.zoom,
    };
  };

  const focusViewport = () => {
    viewportRef.current?.focus({ preventScroll: true });
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    focusViewport();
    panRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: viewRef.current.x,
      originY: viewRef.current.y,
    };
    setPanning(true);
    setPendingFrom(null);
    onSelectNode(null);
    onSelectEdge(null);
  };

  const handleCanvasPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-canvas-control]")) return;

    if (
      event.button === 1 ||
      (event.button === 0 && spaceRef.current)
    ) {
      event.preventDefault();
      startPan(event);
      return;
    }

    if (event.button === 0) {
      event.preventDefault();
      startPan(event);
    }
  };

  const handleCanvasPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const session = panRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    setView((current) => ({
      ...current,
      x:
        session.originX +
        (event.clientX - session.startClientX),
      y:
        session.originY +
        (event.clientY - session.startClientY),
    }));
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleNodePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    node: GraphNode,
  ) => {
    if (event.button !== 0 || spaceRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-port]")) return;
    if (
      target.closest(
        "input, textarea, select, button, [contenteditable='true']",
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    focusViewport();
    onSelectNode(node.id);
    onSelectEdge(null);
    setPendingFrom(null);

    const session: NodeDragSession = {
      pointerId: event.pointerId,
      id: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: node.x,
      originY: node.y,
      x: node.x,
      y: node.y,
      moved: false,
    };
    dragRef.current = session;
    setDrag(session);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleNodePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const current = viewRef.current;
    const dx = (event.clientX - session.startClientX) / current.zoom;
    const dy = (event.clientY - session.startClientY) / current.zoom;
    const moved =
      session.moved ||
      Math.abs(event.clientX - session.startClientX) +
        Math.abs(event.clientY - session.startClientY) >
        2;
    const next = {
      ...session,
      x: session.originX + dx,
      y: session.originY + dy,
      moved,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const finishNodeDrag = (pointerId: number) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (session.moved) {
      onMoveNode(session.id, round(session.x), round(session.y));
    }
  };

  const handleNodePointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishNodeDrag(event.pointerId);
  };

  const handleNodeLostPointerCapture = (pointerId: number) => {
    finishNodeDrag(pointerId);
  };

  const handleOutputPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    nodeId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setPendingFrom(null);
    const point = clientToWorld(event.clientX, event.clientY);
    const session: ConnectionSession = {
      pointerId: event.pointerId,
      from: nodeId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      cursorX: point.x,
      cursorY: point.y,
      dragging: false,
    };
    connectionRef.current = session;
    setConnection(session);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleOutputPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const session = connectionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const point = clientToWorld(event.clientX, event.clientY);
    const dragging =
      session.dragging ||
      Math.abs(event.clientX - session.startClientX) +
        Math.abs(event.clientY - session.startClientY) >
        4;
    const next = {
      ...session,
      cursorX: point.x,
      cursorY: point.y,
      dragging,
    };
    connectionRef.current = next;
    setConnection(next);
  };

  const handleOutputPointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const session = connectionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const element = document.elementFromPoint(
      event.clientX,
      event.clientY,
    );
    const port =
      element instanceof Element
        ? element.closest<HTMLElement>('[data-port="in"]')
        : null;
    const targetId = port?.dataset.nodeId;

    if (targetId) {
      onCreateEdge(session.from, targetId);
      setPendingFrom(null);
    } else if (!session.dragging) {
      setPendingFrom(session.from);
    }

    connectionRef.current = null;
    setConnection(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleInputPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    nodeId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!pendingFrom) return;
    onCreateEdge(pendingFrom, nodeId);
    setPendingFrom(null);
    setConnection(null);
  };

  const cancelConnection = () => {
    connectionRef.current = null;
    setConnection(null);
  };

  const getEdgePath = (from: GraphNode, to: GraphNode) => {
    const sourceX = from.x + from.width;
    const sourceY = from.y + from.height / 2;
    const targetX = to.x;
    const targetY = to.y + to.height / 2;

    if (from.id === to.id) {
      return `M ${sourceX} ${sourceY} C ${sourceX + 90} ${
        sourceY - 80
      }, ${targetX - 90} ${targetY - 80}, ${targetX} ${targetY}`;
    }

    const control = Math.max(70, Math.abs(targetX - sourceX) * 0.55);
    return `M ${sourceX} ${sourceY} C ${sourceX + control} ${sourceY}, ${
      targetX - control
    } ${targetY}, ${targetX} ${targetY}`;
  };

  const getPageName = (id: string | undefined) => {
    if (!id) return t("projects.workspace.behavior.fields.ownerNode");
    return pagesById.get(id)?.name ?? id;
  };

  const getStateName = (id: string | undefined) => {
    if (!id) return t("projects.workspace.behavior.anyState");
    return states.find((state) => state.id === id)?.name ?? id;
  };

  const getBlockTitle = (block: CanvasBehaviorBlock) => {
    if (block.type === "event") {
      return t(behaviorEventLabelKey(block.event ?? ""));
    }
    if (block.type === "condition") {
      if (block.conditions?.length) {
        return t("projects.workspace.behavior.conditionGroup");
      }
      const source =
        BEHAVIOR_CONDITION_SOURCES.find(
          (item) => item.source === block.condition?.source,
        ) ?? BEHAVIOR_CONDITION_SOURCES[0];
      return t(source.labelKey);
    }
    if (block.type === "action") {
      return block.action
        ? t(behaviorActionLabelKey(block.action.type))
        : t("projects.workspace.behavior.actions.custom");
    }
    const text = block.text?.trim();
    return text || t("projects.workspace.behavior.noteEmpty");
  };

  const getBlockMeta = (block: CanvasBehaviorBlock) => {
    if (block.type === "event") {
      return getStateName(block.stateId);
    }
    if (block.type === "condition") {
      if (block.conditions?.length) {
        return [
          t(
            block.conditionMode === "any"
              ? "projects.workspace.behavior.conditionModeAny"
              : "projects.workspace.behavior.conditionModeAll",
          ),
          `${block.conditions.length}`,
          t("projects.workspace.behavior.conditionsTitle"),
        ].join(" · ");
      }
      if (!block.condition) return "";
      const condition = block.condition;
      return [
        getPageName(condition.targetId),
        condition.key,
        `${condition.operator} ${condition.value}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (block.type === "action" && block.action) {
      const action = block.action;
      if (action.type === "navigate") {
        return action.pageId
          ? getPageName(action.pageId)
          : t("projects.workspace.behavior.fields.choosePage");
      }
      if (action.type === "setState") {
        return action.value
          ? getStateName(action.value)
          : t("projects.workspace.behavior.fields.chooseState");
      }
      return [
        getPageName(action.targetId),
        action.key,
        action.value,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    return "";
  };

  const gridSize = 20 * view.zoom;
  const majorSize = gridSize * 5;
  const gridStyle: CSSProperties = {
    backgroundImage: [
      "linear-gradient(to right, var(--mf-canvas-grid-major) 1px, transparent 1px)",
      "linear-gradient(to bottom, var(--mf-canvas-grid-major) 1px, transparent 1px)",
      "linear-gradient(to right, var(--mf-canvas-grid) 1px, transparent 1px)",
      "linear-gradient(to bottom, var(--mf-canvas-grid) 1px, transparent 1px)",
    ].join(","),
    backgroundSize: `${majorSize}px ${majorSize}px, ${majorSize}px ${majorSize}px, ${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px`,
    backgroundPosition: `${view.x}px ${view.y}px`,
  };

  const worldStyle: CSSProperties = {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
  };

  const connectionSource = connection
    ? nodeMap.get(connection.from)
    : null;
  const connectionPath =
    connection && connectionSource
      ? `M ${connectionSource.x + connectionSource.width} ${
          connectionSource.y + connectionSource.height / 2
        } L ${connection.cursorX} ${connection.cursorY}`
      : null;
  const nearbyExit =
    pendingFrom && nodeMap.has(pendingFrom)
      ? nodeMap.get(pendingFrom)
      : null;

  return (
    <div
      ref={viewportRef}
      className={styles.viewport}
      style={gridStyle}
      data-panning={panning ? "true" : undefined}
      data-space={spaceHeld ? "true" : undefined}
      role="application"
      aria-label={t("projects.workspace.behavior.graphTitle")}
      tabIndex={0}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onLostPointerCapture={endPan}
      onContextMenu={(event) => openContextMenu(event)}
    >
      <div className={styles.world} style={worldStyle}>
        <svg className={styles.edgeLayer} width={20000} height={20000}>
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker
              id={selectedArrowId}
              className={styles.selectedMarker}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return null;
            const selected = edge.id === selectedEdgeId;
            const path = getEdgePath(from, to);
            const labelX = (from.x + from.width + to.x) / 2;
            const labelY =
              (from.y + from.height / 2 + to.y + to.height / 2) / 2 -
              8;
            const label =
              edge.label ??
              `${getBlockOrStateName(from)} → ${getBlockOrStateName(to)}`;

            return (
              <g
                key={edge.id}
                className={styles.edge}
                data-selected={selected ? "true" : undefined}
                role="button"
                tabIndex={0}
                aria-label={label}
                onPointerDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => {
                  focusViewport();
                  onSelectEdge(edge.id);
                  onSelectNode(null);
                  openContextMenu(event, { edgeId: edge.id });
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  focusViewport();
                  onSelectEdge(edge.id);
                  onSelectNode(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectEdge(edge.id);
                    onSelectNode(null);
                  }
                }}
              >
                <path className={styles.edgeHit} d={path} />
                <path
                  className={styles.edgeLine}
                  d={path}
                  markerEnd={`url(#${
                    selected ? selectedArrowId : arrowId
                  })`}
                />
                {edge.label ? (
                  <text
                    className={styles.edgeLabel}
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {connectionPath ? (
            <path
              className={styles.connectionLine}
              d={connectionPath}
            />
          ) : null}
        </svg>

        {renderNodes.map((node) => {
          const selected = node.id === selectedNodeId;
          const state = node.state;
          const block = node.block;
          const inputActive = Boolean(pendingFrom || connection);
          return (
            <div
              key={node.id}
              className={styles.node}
              data-kind={node.kind}
              data-type={state ? "state" : block?.type}
              data-selected={selected ? "true" : undefined}
              data-initial={state?.initial ? "true" : undefined}
              data-dragging={drag?.id === node.id ? "true" : undefined}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
              }}
              onPointerDown={(event) =>
                handleNodePointerDown(event, node)
              }
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
              onPointerCancel={handleNodePointerUp}
              onLostPointerCapture={(event) =>
                handleNodeLostPointerCapture(event.pointerId)
              }
              onContextMenu={(event) => {
                focusViewport();
                onSelectNode(node.id);
                onSelectEdge(null);
                openContextMenu(event, { nodeId: node.id });
              }}
            >
              <button
                className={`${styles.port} ${styles.portIn}`}
                type="button"
                data-port="in"
                data-node-id={node.id}
                data-target-active={inputActive ? "true" : undefined}
                aria-label={t(
                  "projects.workspace.behavior.inputPort",
                )}
                onPointerDown={(event) =>
                  handleInputPointerDown(event, node.id)
                }
              />
              {selected &&
              ((state && renderStateEditor) ||
                (block && renderBlockEditor)) ? (
                <div className={styles.inlineEditor}>
                  {state
                    ? renderStateEditor?.(state)
                    : block
                      ? renderBlockEditor?.(block)
                      : null}
                </div>
              ) : state ? (
                <div className={styles.stateNode}>
                  <span
                    className={styles.stateMarker}
                    data-initial={state.initial ? "true" : undefined}
                    aria-hidden="true"
                  />
                  <span className={styles.stateName}>{state.name}</span>
                  {state.initial ? (
                    <span className={styles.stateBadge}>
                      {t(
                        "projects.workspace.behavior.stateInitialBadge",
                      )}
                    </span>
                  ) : null}
                </div>
              ) : block ? (
                <>
                  <div className={styles.nodeHeader}>
                    <span className={styles.nodeType}>
                      {t(
                        `projects.workspace.behavior.blockTypes.${block.type}`,
                      )}
                    </span>
                    {block.type === "event" && block.stateId ? (
                      <span className={styles.nodeBadge}>
                        {getStateName(block.stateId)}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.nodeBody}>
                    <span className={styles.nodeTitle}>
                      {getBlockTitle(block)}
                    </span>
                    <span className={styles.nodeMeta}>
                      {getBlockMeta(block) ||
                        (block.type === "note"
                          ? null
                          : t("projects.workspace.behavior.nodeNoConfig"))}
                    </span>
                  </div>
                </>
              ) : null}
              <button
                className={`${styles.port} ${styles.portOut}`}
                type="button"
                data-port="out"
                data-node-id={node.id}
                aria-label={t(
                  "projects.workspace.behavior.outputPort",
                )}
                onPointerDown={(event) =>
                  handleOutputPointerDown(event, node.id)
                }
                onPointerMove={handleOutputPointerMove}
                onPointerUp={handleOutputPointerUp}
                onPointerCancel={cancelConnection}
              />
            </div>
          );
        })}

        {nearbyExit && pendingFrom ? (
          <div
            className={styles.pendingBadge}
            style={{
              left: nearbyExit.x + nearbyExit.width + 10,
              top:
                nearbyExit.y +
                nearbyExit.height / 2 -
                12,
            }}
          >
            {t("projects.workspace.behavior.pendingEdgeHint")}
          </div>
        ) : null}
      </div>

      {renderNodes.length === 0 ? (
        <div className={styles.empty}>
          {t("projects.workspace.behavior.emptyHint")}
        </div>
      ) : null}

      <div className={styles.toolbar} data-canvas-control="true">
        <button
          className={styles.toolbarButton}
          type="button"
          aria-label={t("projects.workspace.behavior.zoomOut")}
          onClick={() => zoomBy(1 / 1.2)}
        >
          −
        </button>
        <span className={styles.zoomLabel}>
          {Math.round(view.zoom * 100)}%
        </span>
        <button
          className={styles.toolbarButton}
          type="button"
          aria-label={t("projects.workspace.behavior.zoomIn")}
          onClick={() => zoomBy(1.2)}
        >
          +
        </button>
        <button
          className={styles.fitButton}
          type="button"
          onClick={fitView}
        >
          {t("projects.workspace.behavior.fitView")}
        </button>
      </div>

      {selectedEdgeId ? (
        <button
          className={styles.edgeDelete}
          type="button"
          data-canvas-control="true"
          onClick={() => onDeleteEdge(selectedEdgeId)}
        >
          {t("projects.workspace.behavior.deleteEdge")}
        </button>
      ) : null}

      <div className={styles.hint}>
        {t("projects.workspace.behavior.graphHint")}
      </div>

      {contextMenu ? (
        <>
          <button
            className={styles.contextBackdrop}
            type="button"
            aria-label={t("projects.workspace.behavior.closeMenu")}
            onClick={() => setContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            className={styles.contextMenu}
            role="menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {contextMenu.nodeId ? (
              <button
                className={styles.contextDanger}
                type="button"
                role="menuitem"
                disabled={
                  states.some(
                    (state) => state.id === contextMenu.nodeId,
                  ) && states.length <= 1
                }
                onClick={() => {
                  onDeleteNode(contextMenu.nodeId as string);
                  setContextMenu(null);
                }}
              >
                {t("projects.workspace.behavior.deleteNode")}
              </button>
            ) : contextMenu.edgeId ? (
              <button
                className={styles.contextDanger}
                type="button"
                role="menuitem"
                onClick={() => {
                  onDeleteEdge(contextMenu.edgeId as string);
                  setContextMenu(null);
                }}
              >
                {t("projects.workspace.behavior.deleteEdge")}
              </button>
            ) : (
              <button
                className={styles.contextItem}
                type="button"
                role="menuitem"
                onClick={() => {
                  fitView();
                  setContextMenu(null);
                }}
              >
                {t("projects.workspace.behavior.fitView")}
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function getBlockOrStateName(node: GraphNode) {
  if (node.state) return node.state.name;
  if (!node.block) return node.id;
  if (node.block.type === "event") return node.block.event ?? "event";
  if (node.block.type === "condition") {
    if (node.block.conditions?.length) return "condition-group";
    return node.block.condition?.source ?? "condition";
  }
  if (node.block.type === "action") {
    return node.block.action?.type ?? "action";
  }
  return node.block.text ?? "note";
}
