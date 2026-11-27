import {
  createContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";

import type {
  CanvasBehaviorBlock,
  CanvasBehaviorEdge,
} from "./canvasDocument";
import {
  BEHAVIOR_CONDITION_SOURCES,
  behaviorActionLabelKey,
  behaviorEventLabelKey,
  behaviorFunctionFrames,
  behaviorOutputPorts,
  behaviorScopeMembers,
  readBehaviorApplyEntries,
} from "./canvasBehavior";
import styles from "./BehaviorGraphCanvas.module.css";
import type { CanvasTool } from "./canvasTools";

export const BEHAVIOR_GRAPH_NODE_WIDTH = 220;

export const BEHAVIOR_GRAPH_NODE_HEIGHT: Record<
  CanvasBehaviorBlock["type"],
  number
> = {
  event: 72,
  condition: 72,
  action: 72,
  switch: 88,
  note: 72,
  reference: 64,
  function: 96,
  call: 72,
  loop: 88,
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const ZOOM_SENSITIVITY = 0.0015;

const LAYER_DRAG_MIME = "application/x-morfa-layer";
export const BEHAVIOR_PHRASE_MIME = "application/x-morfa-behavior-phrase";

export interface BehaviorTargetDragState {
  sourceBlockId: string | null;
  hoverKey: string | null;
}

export interface BehaviorTargetDrop {
  blockId: string;
  kind: "action" | "condition" | "event" | "switch";
  index: number | null;
}

export const BehaviorTargetDragContext =
  createContext<BehaviorTargetDragState>({
    sourceBlockId: null,
    hoverKey: null,
  });

function isFlowBlock(type: CanvasBehaviorBlock["type"]) {
  return type !== "note" && type !== "reference";
}

function blurEditableExcept(target: EventTarget | null) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  const editable =
    active.isContentEditable ||
    active.tagName === "INPUT" ||
    active.tagName === "TEXTAREA" ||
    active.tagName === "SELECT";
  if (!editable) return;
  if (target instanceof Node && active.contains(target)) return;
  active.blur();
}

function outputPortY(
  node: { y: number; height: number; block?: CanvasBehaviorBlock },
  portId: string | undefined,
) {
  const ports = node.block ? behaviorOutputPorts(node.block) : [{ id: "out" }];
  const index = ports.findIndex((port) => port.id === (portId || "out"));
  if (ports.length <= 1 || index < 0) return node.y + node.height / 2;
  return node.y + (node.height * (index + 1)) / (ports.length + 1);
}

function flowNodeUnderPoint(clientX: number, clientY: number) {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (!(element instanceof Element)) continue;
    const port = element.closest<HTMLElement>('[data-port="in"]');
    const portNodeId = port?.dataset.nodeId;
    if (portNodeId) return portNodeId;
    const node = element.closest<HTMLElement>("[data-graph-node]");
    if (!node) continue;
    const type = node.dataset.type;
    if (type === "note" || type === "reference") continue;
    if (node.dataset.graphNode) return node.dataset.graphNode;
  }
  return null;
}

function edgeSpread(
  edges: CanvasBehaviorEdge[],
  edge: CanvasBehaviorEdge,
  end: "from" | "to",
) {
  const siblings = edges.filter((item) =>
    end === "from"
      ? item.from === edge.from && (item.label ?? "") === (edge.label ?? "")
      : item.to === edge.to,
  );
  if (siblings.length < 2) return 0;
  const index = siblings.findIndex((item) => item.id === edge.id);
  return (index - (siblings.length - 1) / 2) * 16;
}

function slotUnderPoint(clientX: number, clientY: number) {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    if (!(element instanceof Element)) continue;
    const slot = element.closest("[data-target-slot]");
    if (!(slot instanceof HTMLElement)) continue;
    const blockId = slot.dataset.targetBlock;
    const kind = slot.dataset.targetKind;
    if (
      !blockId ||
      (kind !== "action" &&
        kind !== "condition" &&
        kind !== "event" &&
        kind !== "switch")
    ) {
      continue;
    }
    const indexText = slot.dataset.targetIndex ?? "";
    const index = indexText === "" ? null : Number(indexText);
    return {
      blockId,
      kind,
      index: Number.isInteger(index) ? index : null,
      key: `${blockId}\0${kind}\0${indexText}`,
    } satisfies BehaviorTargetDrop & { key: string };
  }
  return null;
}

function hasLayerDrag(dataTransfer: DataTransfer) {
  return [...dataTransfer.types].includes(LAYER_DRAG_MIME);
}

function nodesInMarquee(
  nodes: GraphNode[],
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

  return nodes
    .filter(
      (node) =>
        node.x < worldRight &&
        node.x + node.width > worldLeft &&
        node.y < worldBottom &&
        node.y + node.height > worldTop,
    )
    .map((node) => node.id);
}
interface GraphNode {
  id: string;
  kind: "block";
  x: number;
  y: number;
  width: number;
  height: number;
  block?: CanvasBehaviorBlock;
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

interface MarqueeSession {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
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
  companions: { id: string; originX: number; originY: number }[];
}

interface ConnectionSession {
  pointerId: number;
  from: string;
  port: string;
  startClientX: number;
  startClientY: number;
  cursorX: number;
  cursorY: number;
  dragging: boolean;
  hoverId: string | null;
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
  blocks,
  edges,
  activeTool,
  selectedNodeIds,
  selectedEdgeId,
  fitKey,
  apiRef,
  onSelectNodes,
  onSelectEdge,
  onMoveNode,
  onMoveNodes,
  onCreateEdge,
  onDeleteEdge,
  onDeleteNode,
  onCreateEvent,
  onCreateReference,
  onCreatePhrase,
  onAssignReference,
  onOpenFunction,
}: {
  blocks: CanvasBehaviorBlock[];
  edges: CanvasBehaviorEdge[];
  activeTool: CanvasTool;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  fitKey?: string;
  apiRef?: { current: BehaviorGraphCanvasApi | null };
  onSelectNodes: (ids: string[]) => void;
  onSelectEdge: (id: string | null) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onMoveNodes?: (
    moves: { id: string; x: number; y: number }[],
  ) => void;
  onCreateEdge: (from: string, to: string, label?: string) => void;
  onDeleteEdge: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onCreateEvent?: () => void;
  onCreateReference?: (nodeId: string, x: number, y: number) => void;
  onCreatePhrase?: (phrase: string, x: number, y: number) => void;
  onAssignReference?: (
    referenceBlockId: string,
    target: BehaviorTargetDrop,
  ) => void;
  onOpenFunction?: (functionId: string) => void;
}) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<CanvasView>({
    x: 48,
    y: 36,
    zoom: 1,
  });
  const viewRef = useRef(view);
  const gestureRef = useRef<{
    view: CanvasView;
    px: number;
    py: number;
  } | null>(null);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const panRef = useRef<PanSession | null>(null);
  const marqueeRef = useRef<MarqueeSession | null>(null);
  const [drag, setDrag] = useState<NodeDragSession | null>(null);
  const dragRef = useRef<NodeDragSession | null>(null);
  const targetDragRef = useRef<BehaviorTargetDragState>({
    sourceBlockId: null,
    hoverKey: null,
  });
  const targetDropRef = useRef<BehaviorTargetDrop | null>(null);
  const [targetDrag, setTargetDrag] = useState<BehaviorTargetDragState>(
    targetDragRef.current,
  );
  const [connection, setConnection] = useState<ConnectionSession | null>(
    null,
  );
  const connectionRef = useRef<ConnectionSession | null>(null);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const pendingPortRef = useRef("out");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
    edgeId?: string;
  } | null>(null);
  const lastFitKeyRef = useRef<string | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const [nodeSizes, setNodeSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const markerBase = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const arrowId = `morfa-behavior-arrow-${markerBase}`;
  const selectedArrowId = `morfa-behavior-arrow-selected-${markerBase}`;

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const root = worldRef.current;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      const next: Record<string, { width: number; height: number }> = {};
      root
        .querySelectorAll<HTMLElement>("[data-graph-node]")
        .forEach((element) => {
          const id = element.dataset.graphNode;
          if (!id) return;
          next[id] = {
            width: Math.round(element.offsetWidth),
            height: Math.round(element.offsetHeight),
          };
        });
      setNodeSizes((current) => {
        const currentIds = Object.keys(current);
        const nextIds = Object.keys(next);
        if (currentIds.length !== nextIds.length) return next;
        for (const id of nextIds) {
          const item = next[id];
          const previous = current[id];
          if (
            !item ||
            !previous ||
            previous.width !== item.width ||
            previous.height !== item.height
          ) {
            return next;
          }
        }
        return current;
      });
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    const watch = () => {
      root
        .querySelectorAll<HTMLElement>("[data-graph-node]")
        .forEach((element) => observer.observe(element));
      measure();
    };
    watch();
    const mutation = new MutationObserver(watch);
    mutation.observe(root, { childList: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutation.disconnect();
    };
  }, [blocks]);

  const baseNodes = useMemo<GraphNode[]>(() => {
    return blocks.map((block) => ({
      id: block.id,
      kind: "block" as const,
      x: block.x,
      y: block.y,
      width: nodeSizes[block.id]?.width ?? 160,
      height: nodeSizes[block.id]?.height ?? 44,
      block,
    }));
  }, [blocks, nodeSizes]);

  const renderNodes = useMemo(() => {
    if (!drag) return baseNodes;
    const dx = drag.x - drag.originX;
    const dy = drag.y - drag.originY;
    const companions = new Map(
      drag.companions.map((item) => [item.id, item]),
    );
    return baseNodes.map((node) => {
      if (node.id === drag.id) return { ...node, x: drag.x, y: drag.y };
      const companion = companions.get(node.id);
      if (!companion) return node;
      return {
        ...node,
        x: companion.originX + dx,
        y: companion.originY + dy,
      };
    });
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

  const resetView = () => {
    const element = viewportRef.current;
    if (!element) return;
    if (renderNodes.length === 0) {
      setView({ x: 56, y: 48, zoom: 1 });
      return;
    }
    const minX = Math.min(...renderNodes.map((node) => node.x));
    const minY = Math.min(...renderNodes.map((node) => node.y));
    setView({
      x: 56 - minX,
      y: 56 - minY,
      zoom: 1,
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
    if (renderNodes.length === 0) return;
    lastFitKeyRef.current = fitKey;
    resetView();
  });

  const focusedSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    const selectedNodeId =
      selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
    if (!selectedNodeId) {
      focusedSelectionRef.current = null;
      return;
    }
    const focusKey = selectedNodeId;
    if (focusedSelectionRef.current === focusKey) return;
    const element = viewportRef.current;
    const node = baseNodes.find((item) => item.id === selectedNodeId);
    if (!element || !node) return;
    focusedSelectionRef.current = focusKey;
    const current = viewRef.current;
    const padding = 40;
    const left = node.x * current.zoom + current.x;
    const top = node.y * current.zoom + current.y;
    const right = left + node.width * current.zoom;
    const bottom = top + node.height * current.zoom;
    let dx = 0;
    let dy = 0;

    if (left < padding) dx = padding - left;
    else if (right > element.clientWidth - padding) {
      dx = element.clientWidth - padding - right;
    }
    if (top < padding) dy = padding - top;
    else if (bottom > element.clientHeight - padding) {
      dy = element.clientHeight - padding - bottom;
    }

    if (dx || dy) {
      setView({
        ...current,
        x: current.x + dx,
        y: current.y + dy,
      });
    }
  }, [baseNodes, selectedNodeIds]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1;
      const deltaX = event.deltaX * unit;
      const deltaY = event.deltaY * unit;

      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const factor = Math.exp(-deltaY * ZOOM_SENSITIVITY);
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
        typeof event.clientX === "number" && Number.isFinite(event.clientX)
          ? event.clientX
          : rect.left + rect.width / 2;
      const clientY =
        typeof event.clientY === "number" && Number.isFinite(event.clientY)
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
  }, [blocks, edges]);

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
  };

  const handleCanvasPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement;
    if (
      !target.closest("input, textarea, select, [contenteditable='true']")
    ) {
      blurEditableExcept(event.target);
      focusViewport();
    }
    if (target.closest("[data-canvas-control]")) return;

    if (
      event.button === 1 ||
      (event.button === 0 && spaceRef.current)
    ) {
      event.preventDefault();
      startPan(event);
      return;
    }

    if (event.button !== 0) return;

    if (activeTool === "hand") {
      event.preventDefault();
      startPan(event);
      return;
    }

    if (activeTool === "move") {
      event.preventDefault();
      onSelectNodes([]);
      onSelectEdge(null);
      return;
    }

    if (activeTool !== "select") return;

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    onSelectNodes([]);
    onSelectEdge(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    marqueeRef.current = {
      pointerId: event.pointerId,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    };
    setMarquee({ left: x, top: y, width: 0, height: 0 });
  };

  const handleCanvasPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
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

  const endMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const selection = marqueeRef.current;
    if (!selection || selection.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    marqueeRef.current = null;
    setMarquee(null);
    onSelectNodes(
      nodesInMarquee(
        baseNodes,
        selection.startX,
        selection.startY,
        selection.currentX,
        selection.currentY,
        viewRef.current,
      ),
    );
  };

  const handleCanvasPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (panRef.current?.pointerId === event.pointerId) {
      endPan(event);
      return;
    }
    endMarquee(event);
  };

  const handleCanvasLostPointerCapture = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (marqueeRef.current?.pointerId === event.pointerId) {
      marqueeRef.current = null;
      setMarquee(null);
    }
    endPan(event);
  };

  const handleNodePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    node: GraphNode,
  ) => {
    if (
      event.button !== 0 ||
      spaceRef.current ||
      activeTool === "hand"
    ) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("[data-port]")) return;
    if (
      !target.closest("input, textarea, select, [contenteditable='true']")
    ) {
      blurEditableExcept(event.target);
    }
    if (
      pendingFrom &&
      pendingFrom !== node.id &&
      node.block &&
      isFlowBlock(node.block.type) &&
      !target.closest(
        "input, textarea, select, button, a, [contenteditable='true']",
      )
    ) {
      event.preventDefault();
      onCreateEdge(pendingFrom, node.id, pendingPortRef.current);
      setPendingFrom(null);
      setConnection(null);
      return;
    }

    const referenceDrag = node.block?.type === "reference";
    const fieldTarget =
      !referenceDrag &&
      target.closest(
        "input, textarea, select, button, [contenteditable='true']",
      );
    const editorBody =
      !referenceDrag &&
      target.closest("[data-node-editor]") &&
      !target.closest("[data-node-drag-handle]");

    event.stopPropagation();
    focusViewport();
    const keepGroup =
      activeTool === "move" &&
      !referenceDrag &&
      selectedNodeIds.includes(node.id) &&
      selectedNodeIds.length > 1;
    if (!keepGroup) onSelectNodes([node.id]);
    onSelectEdge(null);
    setPendingFrom(null);

    if (activeTool !== "move" || fieldTarget || editorBody) return;

    event.preventDefault();
    const memberIds =
      node.block?.type === "function"
        ? behaviorScopeMembers(blocks, node.id, edges)
        : [];
    const companionIds = new Set<string>();
    const companions = [
      ...(keepGroup ? selectedNodeIds : []),
      ...memberIds,
    ].flatMap((id) => {
      if (id === node.id || companionIds.has(id)) return [];
      companionIds.add(id);
      const block = blocks.find((item) => item.id === id);
      return block ? [{ id, originX: block.x, originY: block.y }] : [];
    });

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
      companions,
    };
    dragRef.current = session;
    setDrag(session);
    if (referenceDrag) {
      targetDropRef.current = null;
      const nextDrag = { sourceBlockId: node.id, hoverKey: null };
      targetDragRef.current = nextDrag;
      setTargetDrag(nextDrag);
    }
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
    if (targetDragRef.current.sourceBlockId === session.id) {
      const hover = slotUnderPoint(event.clientX, event.clientY);
      targetDropRef.current = hover;
      const hoverKey = hover?.key ?? null;
      if (hoverKey !== targetDragRef.current.hoverKey) {
        const nextDrag = { sourceBlockId: session.id, hoverKey };
        targetDragRef.current = nextDrag;
        setTargetDrag(nextDrag);
      }
    }
  };

  const finishNodeDrag = (pointerId: number) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== pointerId) return;
    dragRef.current = null;
    setDrag(null);
    const assignTarget =
      targetDragRef.current.sourceBlockId === session.id
        ? targetDropRef.current
        : null;
    if (targetDragRef.current.sourceBlockId) {
      targetDragRef.current = { sourceBlockId: null, hoverKey: null };
      targetDropRef.current = null;
      setTargetDrag(targetDragRef.current);
    }
    if (assignTarget && session.moved && onAssignReference) {
      onAssignReference(session.id, assignTarget);
      return;
    }
    if (session.moved) {
      const dx = session.x - session.originX;
      const dy = session.y - session.originY;
      const moves = [
        { id: session.id, x: round(session.x), y: round(session.y) },
        ...session.companions.map((item) => ({
          id: item.id,
          x: round(item.originX + dx),
          y: round(item.originY + dy),
        })),
      ];
      if (onMoveNodes) onMoveNodes(moves);
      else onMoveNode(session.id, round(session.x), round(session.y));
    }
  };

  const handleNodePointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (targetDragRef.current.sourceBlockId === dragRef.current.id) {
      const hover = slotUnderPoint(event.clientX, event.clientY);
      targetDropRef.current = hover;
      targetDragRef.current = {
        sourceBlockId: dragRef.current.id,
        hoverKey: hover?.key ?? null,
      };
    }
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
    portId: string,
  ) => {
    if (
      event.button !== 0 ||
      spaceRef.current ||
      activeTool === "hand"
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (activeTool !== "select") return;
    setPendingFrom(null);
    pendingPortRef.current = portId;
    const point = clientToWorld(event.clientX, event.clientY);
    const session: ConnectionSession = {
      pointerId: event.pointerId,
      from: nodeId,
      port: portId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      cursorX: point.x,
      cursorY: point.y,
      dragging: false,
      hoverId: null,
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
    const hoverId = flowNodeUnderPoint(event.clientX, event.clientY);
    const next = {
      ...session,
      cursorX: point.x,
      cursorY: point.y,
      dragging,
      hoverId: hoverId && hoverId !== session.from ? hoverId : null,
    };
    connectionRef.current = next;
    setConnection(next);
  };

  const handleOutputPointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const session = connectionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const hovered = flowNodeUnderPoint(event.clientX, event.clientY);
    const targetId =
      hovered && hovered !== session.from ? hovered : null;

    if (targetId) {
      onCreateEdge(session.from, targetId, session.port);
      setPendingFrom(null);
    } else if (!session.dragging) {
      pendingPortRef.current = session.port;
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
    if (
      event.button !== 0 ||
      spaceRef.current ||
      activeTool === "hand"
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (activeTool !== "select" || !pendingFrom) return;
    onCreateEdge(pendingFrom, nodeId, pendingPortRef.current);
    setPendingFrom(null);
    setConnection(null);
  };

  const cancelConnection = () => {
    connectionRef.current = null;
    setConnection(null);
  };

  const getEdgePath = (
    from: GraphNode,
    to: GraphNode,
    portId?: string,
    sourceSpread = 0,
    targetSpread = 0,
  ) => {
    const sourceX = from.x + from.width;
    const sourceY = outputPortY(from, portId) + sourceSpread;
    const targetX = to.x;
    const targetY = to.y + to.height / 2 + targetSpread;

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
    if (block.type === "switch") {
      return block.key
        ? block.key
        : t("projects.workspace.behavior.blockTypes.switch");
    }
    if (block.type === "action") {
      if (block.action?.type === "apply") {
        const count = readBehaviorApplyEntries(block.action.value).length;
        return t("projects.workspace.behavior.applyCount", { count });
      }
      return block.action
        ? t(behaviorActionLabelKey(block.action.type))
        : t("projects.workspace.behavior.actions.custom");
    }
    if (block.type === "reference") {
      return block.nodeId ?? t("projects.workspace.behavior.dropTarget");
    }
    if (block.type === "function") {
      return (
        block.text?.trim() ||
        t("projects.workspace.behavior.blockTypes.function")
      );
    }
    if (block.type === "call") {
      const target = blocks.find(
        (item) => item.id === block.key && item.type === "function",
      );
      const name = target?.text?.trim();
      return name
        ? t("projects.workspace.behavior.callNamed", { name })
        : t("projects.workspace.behavior.blockTypes.call");
    }
    if (block.type === "loop") {
      return t("projects.workspace.behavior.loopCount", {
        count: block.value?.trim() || "0",
      });
    }
    const text = block.text?.trim();
    return text || t("projects.workspace.behavior.noteEmpty");
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
      ? `M ${connectionSource.x + connectionSource.width} ${outputPortY(
          connectionSource,
          connection.port,
        )} L ${connection.cursorX} ${connection.cursorY}`
      : null;
  const nearbyExit =
    pendingFrom && nodeMap.has(pendingFrom)
      ? nodeMap.get(pendingFrom)
      : null;

  return (
    <BehaviorTargetDragContext.Provider value={targetDrag}>
    <div
      ref={viewportRef}
      className={styles.viewport}
      style={gridStyle}
      data-tool={activeTool}
      data-panning={panning ? "true" : undefined}
      data-marquee={marquee ? "true" : undefined}
      data-space={spaceHeld ? "true" : undefined}
      role="application"
      aria-label={t("projects.workspace.behavior.graphTitle")}
      tabIndex={0}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onDragOver={(event) => {
        const phrase = event.dataTransfer.types.includes(
          BEHAVIOR_PHRASE_MIME,
        );
        const layer = hasLayerDrag(event.dataTransfer);
        if (phrase && onCreatePhrase) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          return;
        }
        if (!layer || !onCreateReference) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const phrase = event.dataTransfer.getData(BEHAVIOR_PHRASE_MIME);
        const point = clientToWorld(event.clientX, event.clientY);
        if (phrase && onCreatePhrase) {
          event.preventDefault();
          onCreatePhrase(phrase, point.x, point.y);
          return;
        }
        if (!onCreateReference) return;
        const nodeId = event.dataTransfer.getData(LAYER_DRAG_MIME);
        if (!nodeId) return;
        event.preventDefault();
        onCreateReference(
          nodeId,
          point.x - BEHAVIOR_GRAPH_NODE_WIDTH / 2,
          point.y - BEHAVIOR_GRAPH_NODE_HEIGHT.reference / 2,
        );
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerCancel={handleCanvasPointerUp}
      onLostPointerCapture={handleCanvasLostPointerCapture}
      onContextMenu={(event) => {
        openContextMenu(event);
      }}
    >
      {marquee ? (
        <div
          className={styles.marquee}
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      ) : null}
      <div ref={worldRef} className={styles.world} style={worldStyle}>
        {behaviorFunctionFrames(
          renderNodes.flatMap((node) =>
            node.block
              ? [
                  {
                    ...node.block,
                    x: node.x,
                    y: node.y,
                    width: node.width,
                    height: node.height,
                  },
                ]
              : [],
          ),
          edges,
        ).map((frame) => (
          <div
            key={frame.id}
            className={styles.functionFrame}
            data-depth={String(Math.min(frame.depth, 3))}
            style={{
              left: frame.x,
              top: frame.y,
              width: frame.width,
              height: frame.height,
            }}
          >
            <span className={styles.functionFrameLabel}>
              {frame.name ||
                t("projects.workspace.behavior.blockTypes.function")}
            </span>
          </div>
        ))}
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
            const path = getEdgePath(
              from,
              to,
              edge.label,
              edgeSpread(edges, edge, "from"),
              edgeSpread(edges, edge, "to"),
            );
            const sourceY = outputPortY(from, edge.label);
            const labelX = (from.x + from.width + to.x) / 2;
            const labelY = (sourceY + to.y + to.height / 2) / 2 - 8;
            const label =
              edge.label ??
              `${getBlockName(from)} → ${getBlockName(to)}`;

            return (
              <g
                key={edge.id}
                className={styles.edge}
                data-selected={selected ? "true" : undefined}
                role="button"
                tabIndex={0}
                aria-label={label}
                onPointerDown={(event) => {
                  if (
                    event.button === 1 ||
                    spaceRef.current ||
                    activeTool === "hand"
                  ) {
                    return;
                  }
                  event.stopPropagation();
                }}
                onContextMenu={(event) => {
                  focusViewport();
                  onSelectEdge(edge.id);
                  onSelectNodes([]);
                  openContextMenu(event, { edgeId: edge.id });
                }}
                onClick={(event) => {
                  if (activeTool === "hand") return;
                  event.stopPropagation();
                  focusViewport();
                  onSelectEdge(edge.id);
                  onSelectNodes([]);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectEdge(edge.id);
                    onSelectNodes([]);
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
                {edge.label &&
                edge.label !== "out" &&
                edge.label !== "then" ? (
                  <text
                    className={styles.edgeLabel}
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                  >
                    {edge.label === "else"
                      ? t("projects.workspace.behavior.ports.else")
                      : edge.label === "default"
                        ? t("projects.workspace.behavior.ports.default")
                        : edge.label.startsWith("case:") &&
                            from.block?.type === "switch"
                          ? from.block.cases?.[
                              Number(edge.label.slice(5))
                            ] || edge.label
                          : edge.label}
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
          const block = node.block;
          if (!block) return null;
          const selected = selectedNodeIds.includes(node.id);
          const hasPorts = isFlowBlock(block.type);
          const inputActive = Boolean(pendingFrom || connection);
          return (
            <div
              key={node.id}
              className={styles.node}
              data-graph-node={node.id}
              data-type={block.type}
              data-selected={selected ? "true" : undefined}
              data-drop-target={
                connection?.dragging && connection.hoverId === node.id
                  ? "true"
                  : undefined
              }
              data-dragging={drag?.id === node.id ? "true" : undefined}
              aria-label={
                block.type === "reference"
                  ? undefined
                  : `${t(
                      `projects.workspace.behavior.blockTypes.${block.type}`,
                    )}: ${getBlockTitle(block)}`
              }
              style={{
                left: node.x,
                top: node.y,
                minHeight:
                  behaviorOutputPorts(block).length > 1
                    ? behaviorOutputPorts(block).length * 28
                    : undefined,
              }}
              onPointerDown={(event) =>
                handleNodePointerDown(event, node)
              }
              onDoubleClick={(event) => {
                if (block.type !== "function") return;
                event.stopPropagation();
                onOpenFunction?.(block.id);
              }}
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
              onPointerCancel={handleNodePointerUp}
              onLostPointerCapture={(event) =>
                handleNodeLostPointerCapture(event.pointerId)
              }
              onContextMenu={(event) => {
                const target = event.target as HTMLElement | null;
                if (
                  target?.closest(
                    "input, textarea, select, [contenteditable='true']",
                  )
                ) {
                  event.stopPropagation();
                  return;
                }
                focusViewport();
                onSelectNodes([node.id]);
                onSelectEdge(null);
                openContextMenu(event, { nodeId: node.id });
              }}
            >
              {hasPorts ? (
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
              ) : null}
              <div
                className={styles.nodeHeader}
                data-node-drag-handle="true"
              >
                <span className={styles.nodeType}>
                  {t(
                    `projects.workspace.behavior.blockTypes.${block.type}`,
                  )}
                </span>
              </div>
              <div className={styles.nodeBody}>
                <p className={styles.nodeSummary}>{getBlockTitle(block)}</p>
                {block.type === "function" ? (
                  <button
                    className={styles.openScope}
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenFunction?.(block.id);
                    }}
                  >
                    {t("projects.workspace.behavior.openFunction")}
                  </button>
                ) : null}
              </div>
              {hasPorts
                ? behaviorOutputPorts(block).map((port, index, ports) => {
                    const top =
                      ports.length <= 1
                        ? "50%"
                        : `${((index + 1) / (ports.length + 1)) * 100}%`;
                    const portLabel = port.labelKey
                      ? t(port.labelKey)
                      : port.label;
                    return (
                      <span key={port.id}>
                        {portLabel ? (
                          <span
                            className={styles.portLabel}
                            style={{ top }}
                          >
                            {portLabel}
                          </span>
                        ) : null}
                        <button
                          className={`${styles.port} ${styles.portOut}`}
                          type="button"
                          data-port="out"
                          data-port-id={port.id}
                          data-node-id={node.id}
                          style={{ top }}
                          aria-label={
                            portLabel ||
                            t("projects.workspace.behavior.outputPort")
                          }
                          onPointerDown={(event) =>
                            handleOutputPointerDown(
                              event,
                              node.id,
                              port.id,
                            )
                          }
                          onPointerMove={handleOutputPointerMove}
                          onPointerUp={handleOutputPointerUp}
                          onPointerCancel={cancelConnection}
                        />
                      </span>
                    );
                  })
                : null}
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

      {blocks.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyCard}>
            <span className={styles.emptyHint}>
              {t("projects.workspace.behavior.emptyHint")}
            </span>
            {onCreateEvent ? (
              <button
                className={styles.emptyAction}
                type="button"
                data-canvas-control="true"
                onClick={onCreateEvent}
              >
                <span aria-hidden="true">+</span>
                {t("projects.workspace.behavior.phrases.placeSentence")}
              </button>
            ) : null}
          </div>
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
    </BehaviorTargetDragContext.Provider>
  );
}

function getBlockName(node: GraphNode) {
  const block = node.block;
  if (!block) return node.id;
  if (block.type === "event") return block.event ?? "event";
  if (block.type === "condition") {
    if (block.conditions?.length) return "condition-group";
    return block.condition?.source ?? "condition";
  }
  if (block.type === "action") {
    return block.action?.type ?? "action";
  }
  if (block.type === "reference") return block.nodeId ?? "reference";
  return block.text ?? "note";
}
