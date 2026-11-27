import type { CSSProperties } from "react";

import type { CanvasLink, CanvasPage } from "./canvasDocument";
import {
  getControlDisplayState,
  getControlState,
  getPageFrame,
  resolveStyleVariables,
} from "./canvasDocument";
import { CanvasWidgetView } from "./CanvasWidgetView";
import {
  applyWidgetRuntimeOverrides,
  getControlStateKey,
  getInstanceScope,
  getRuntimeNodeKey,
  runtimeStyleVariables,
  styleVariables,
  type CanvasRuntimeState,
} from "./canvasRuntime";
import styles from "./CanvasNodeView.module.css";

const EMPTY_LINKS: CanvasLink[] = [];
const FRAME_MANAGED_STYLES = new Set([
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
]);

function toReactStyle(stylesMap: Record<string, string>): CSSProperties {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(stylesMap)) {
    if (key.startsWith("--")) {
      result[key] = value;
      continue;
    }
    result[key.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())] =
      value;
  }
  return result as CSSProperties;
}

function hasBehaviorTrigger(page: CanvasPage, event: string) {
  return Boolean(
    page.behavior?.triggers.some((trigger) => trigger.event === event),
  );
}

export interface CanvasNodeEventContext {
  /** Instance path, e.g. `outerInstance` or `outerInstance::innerInstance`. */
  controlScope?: string;
  /** The hidden control definition page that owns the instance. */
  controlDefinitionId?: string;
}

export interface CanvasNodeViewProps {
  page: CanvasPage;
  pages: CanvasPage[];
  links?: CanvasLink[];
  /** The rendered root sits at 0,0 unless `position` overrides it. */
  root?: boolean;
  /** Canvas mode places root pages at their padded world position. */
  position?: { left: number; top: number };
  runtime?: CanvasRuntimeState;
  onEvent?: (
    nodeId: string,
    event: string,
    context?: CanvasNodeEventContext,
  ) => void;
  /** Inherited by all state children so runtime can target the instance. */
  controlScope?: string;
  depth?: number;
  maxDepth?: number;
}

/**
 * Shared visual renderer for a canvas page/node and its descendants. The
 * editor simulator and the standalone screenshot page both use it so styles,
 * layout frames and widget markup cannot drift apart.
 */
export function CanvasNodeView({
  page,
  pages,
  links = EMPTY_LINKS,
  root = false,
  position,
  runtime,
  onEvent,
  controlScope,
  depth = 0,
  maxDepth = 8,
}: CanvasNodeViewProps) {
  const frame = getPageFrame(page, pages, links);
  const resolved = resolveStyleVariables(page.styles, page, pages, links);
  const cssStyles: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolved)) {
    if (!FRAME_MANAGED_STYLES.has(key)) cssStyles[key] = value;
  }
  const instanceScope =
    page.nodeKind === "control-instance"
      ? getInstanceScope(controlScope, page.id)
      : controlScope;
  const runtimeKey = getRuntimeNodeKey(controlScope, page.id);
  const overrides = runtime?.overrides[runtimeKey];
  const left = position?.left ?? (root ? 0 : frame.localX);
  const top = position?.top ?? (root ? 0 : frame.localY);
  const controlStateId =
    page.nodeKind === "control-instance"
      ? runtime?.controlStates[instanceScope ?? page.id] ??
        runtime?.controlStates[
          getControlStateKey(controlScope, page.id)
        ] ??
        page.controlStateId
      : undefined;
  const controlState =
    page.nodeKind === "control-instance"
      ? getControlState(pages, controlStateId) ??
        getControlDisplayState(pages, page)
      : null;
  const controlStateFrame = controlState
    ? getPageFrame(controlState, pages, links)
    : null;
  const nodeStyle: CSSProperties = {
    ...toReactStyle(cssStyles),
    ...(runtimeStyleVariables(overrides) as CSSProperties),
    position: position ? "absolute" : root ? "relative" : "absolute",
    left,
    top,
    width: controlStateFrame?.width ?? frame.width,
    height: controlStateFrame?.height ?? frame.height,
    overflow: "hidden",
  };
  const children =
    depth < maxDepth
      ? pages.filter((item) => item.parentId === page.id)
      : [];
  const widget = applyWidgetRuntimeOverrides(page.widget, overrides);
  const hoverable =
    Boolean(onEvent) &&
    (hasBehaviorTrigger(page, "hoverEnter") ||
      hasBehaviorTrigger(page, "hoverLeave"));
  const owningControl =
    page.nodeKind === "control-instance" && page.controlId
      ? pages.find(
          (item) =>
            item.nodeKind === "control" && item.id === page.controlId,
        ) ?? null
      : null;
  const controlDefinitionId =
    owningControl?.id ??
    (controlScope && page.nodeKind === "control-state"
      ? page.controlId
      : undefined);
  const eventScope =
    page.nodeKind === "control-instance" ? instanceScope : controlScope;
  const eventContext =
    eventScope || controlDefinitionId
      ? { controlScope: eventScope, controlDefinitionId }
      : undefined;
  const clickable =
    Boolean(onEvent) &&
    (hasBehaviorTrigger(page, "click") ||
      Boolean(
        owningControl && hasBehaviorTrigger(owningControl, "click"),
      ));
  return (
    <div
      className={styles.node}
      data-node-id={page.id}
      data-clickable={clickable || undefined}
      style={nodeStyle}
      role={clickable ? "button" : undefined}
      aria-label={clickable ? page.name : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={
        clickable
          ? (event) => {
              event.stopPropagation();
              onEvent?.(page.id, "click", eventContext);
              if (
                owningControl &&
                hasBehaviorTrigger(owningControl, "click")
              ) {
                onEvent?.(owningControl.id, "click", eventContext);
              }
            }
          : undefined
      }
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onEvent?.(page.id, "click", eventContext);
                if (
                  owningControl &&
                  hasBehaviorTrigger(owningControl, "click")
                ) {
                  onEvent?.(owningControl.id, "click", eventContext);
                }
              }
            }
          : undefined
      }
      onMouseEnter={
        hoverable
          ? (event) => {
              event.stopPropagation();
              onEvent?.(page.id, "hoverEnter", eventContext);
            }
          : undefined
      }
      onMouseLeave={
        hoverable
          ? (event) => {
              event.stopPropagation();
              onEvent?.(page.id, "hoverLeave", eventContext);
            }
          : undefined
      }
    >
      {page.nodeKind === "control-instance" ? (
        controlState ? (
          <CanvasNodeView
            page={controlState}
            pages={pages}
            links={links}
            root
            position={{ left: 0, top: 0 }}
            runtime={runtime}
            onEvent={onEvent}
            controlScope={instanceScope}
            depth={depth + 1}
            maxDepth={maxDepth}
          />
        ) : null
      ) : widget ? (
        <CanvasWidgetView
          widget={widget}
          style={
            {
              ...styleVariables(cssStyles),
              ...runtimeStyleVariables(overrides),
            } as CSSProperties
          }
        />
      ) : null}
      {page.nodeKind !== "control-instance" &&
      children.map((child) => (
        <CanvasNodeView
          key={child.id}
          page={child}
          pages={pages}
          links={links}
          runtime={runtime}
          onEvent={onEvent}
          controlScope={controlScope}
          depth={depth + 1}
          maxDepth={maxDepth}
        />
      ))}
    </div>
  );
}
