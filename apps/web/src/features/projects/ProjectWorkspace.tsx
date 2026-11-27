import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";

import type { ProjectSummary } from "../../lib/api";
import {
  copyPageToClipboard,
  duplicatePageFrom,
  hasPageClipboard,
  pastePageFromClipboard,
} from "./canvasClipboard";
import { CanvasLeftSidebar } from "./CanvasLeftSidebar";
import { CanvasRightSidebar } from "./CanvasRightSidebar";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasBehaviorEditor } from "./CanvasBehaviorEditor";
import { CanvasSimulator } from "./CanvasSimulator";
import {
  createRuntimeSnapshot,
  type RuntimeSnapshot,
} from "./canvasRuntime";
import {
  CANVAS_TOOL_SHORTCUTS,
  type CanvasTool,
} from "./canvasTools";
import {
  clearStyleVariableFallbackCache,
  collectCanvasLint,
  createLinkId,
  getCanvasLayout,
  getPageFrame,
  renameLinkReferences,
  renameStyleReferences,
  type CanvasDataEntry,
  type CanvasLink,
  type CanvasLinkAnchor,
  type CanvasLintItem,
  type CanvasPage,
  type CanvasWidget,
  type CanvasBehavior,
} from "./canvasDocument";
import {
  getSubtreeIds,
  movePageInHierarchy,
  type LayerDropPosition,
} from "./canvasHierarchy";
import { useCanvasSnapSettings } from "./canvasSnap";
import { ProjectWorkspaceTopBar } from "./ProjectWorkspaceTopBar";
import { useCanvasHistory } from "./useCanvasHistory";
import { useProjectCanvas } from "./useProjectCanvas";
import styles from "./ProjectWorkspace.module.css";

const DEFAULT_LINK_COLOR = "#8b8ff0";
const MIN_LINT_PANEL_HEIGHT = 120;

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function hasPositionAnchor(styles: Record<string, string>) {
  return ["left", "right", "top", "bottom"].some((key) => {
    const value = styles[key]?.trim().toLowerCase();
    return Boolean(value && value !== "auto");
  });
}

function clearPositionAnchors(styles: Record<string, string>) {
  const next = { ...styles };
  delete next.left;
  delete next.right;
  delete next.top;
  delete next.bottom;
  return next;
}

function LintMessage({ item }: { item: CanvasLintItem }) {
  const { t } = useTranslation();

  switch (item.code) {
    case "malformed":
      return <>{t("projects.workspace.lint.codes.malformed")}</>;
    case "missing-node":
      return (
        <>
          {t("projects.workspace.lint.codes.missingNode", {
            id: item.targetId ?? "",
          })}
        </>
      );
    case "no-access":
      return (
        <>
          {t("projects.workspace.lint.codes.noAccess", {
            name: item.targetName ?? item.targetId ?? "",
          })}
        </>
      );
    case "missing-self-key":
      return (
        <>
          {t("projects.workspace.lint.codes.missingSelfKey", {
            key: item.key ?? "",
          })}
        </>
      );
    case "missing-node-key":
      return (
        <>
          {t("projects.workspace.lint.codes.missingNodeKey", {
            name: item.targetName ?? item.targetId ?? "",
            key: item.key ?? "",
          })}
        </>
      );
    case "layout-invalid":
      return (
        <>
          {t("projects.workspace.lint.codes.layoutInvalid", {
            page: item.pageName,
            property: item.styleKey,
            value: item.expression,
          })}
        </>
      );
  }
}

function CanvasLintPanel({
  items,
  height,
  onHeightChange,
  onClose,
}: {
  items: CanvasLintItem[];
  height: number;
  onHeightChange: (height: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const resizeRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
    };
  };

  const handleResizeMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    const maxHeight = Math.max(
      MIN_LINT_PANEL_HEIGHT,
      window.innerHeight * 0.6,
    );
    const nextHeight = Math.min(
      maxHeight,
      Math.max(
        MIN_LINT_PANEL_HEIGHT,
        resize.startHeight + resize.startY - event.clientY,
      ),
    );
    onHeightChange(nextHeight);
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      className={styles.lintPanel}
      style={{ height }}
      aria-label={t("projects.workspace.lint.title")}
    >
      <div
        className={styles.lintResizeHandle}
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("projects.workspace.lint.resize")}
        onPointerDown={startResize}
        onPointerMove={handleResizeMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={endResize}
      />

      <header className={styles.lintHeader}>
        <div className={styles.lintHeaderTitle}>
          <span className={styles.lintErrorMark}>×</span>
          <span>{t("projects.workspace.lint.title")}</span>
          <span className={styles.lintHeaderCount}>{items.length}</span>
        </div>
        <button
          className={styles.lintClose}
          type="button"
          aria-label={t("projects.workspace.lint.close")}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className={styles.lintList}>
        {items.length ? (
          items.map((item) => (
            <article className={styles.lintItem} key={item.id}>
              <div className={styles.lintItemTitle}>
                <span className={styles.lintErrorMark}>×</span>
                <span>
                  {item.pageName} · {item.styleKey}
                </span>
              </div>
              <code className={styles.lintExpression}>
                {item.expression}
              </code>
              <p className={styles.lintMessage}>
                <LintMessage item={item} />
              </p>
              {item.chain?.length ? (
                <p className={styles.lintChain}>
                  {t("projects.workspace.lint.stack")}:{" "}
                  {item.chain.join(" → ")}
                </p>
              ) : null}
            </article>
          ))
        ) : (
          <p className={styles.lintEmpty}>
            {t("projects.workspace.lint.empty")}
          </p>
        )}
      </div>
    </section>
  );
}

interface ProjectWorkspaceProps {
  project: ProjectSummary;
  onExit: () => void;
}

export function ProjectWorkspace({
  project,
  onExit,
}: ProjectWorkspaceProps) {
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [snapSettings, setSnapSettings] = useCanvasSnapSettings();
  const { pages, links, setDocument } = useProjectCanvas(project.id);
  const {
    commit,
    transient,
    beginTransaction,
    endTransaction,
    undo,
    redo,
  } = useCanvasHistory({ pages, links }, setDocument, project.id);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(
    null,
  );
  const [lintOpen, setLintOpen] = useState(false);
  const [behaviorEditorOpen, setBehaviorEditorOpen] = useState(false);
  const [lintHeight, setLintHeight] = useState(220);
  const [simulator, setSimulator] = useState<{
    snapshot: RuntimeSnapshot;
    sourceSignature: string;
    compiling: boolean;
    progress: number;
  } | null>(null);
  const [runChoice, setRunChoice] = useState<{
    containerId: string;
    candidates: string[];
  } | null>(null);
  const compileTimerRef = useRef<number | null>(null);
  const compileDoneTimerRef = useRef<number | null>(null);
  const selectedPageId =
    selectedPageIds[selectedPageIds.length - 1] ?? null;
  const lintItems = useMemo(
    () => collectCanvasLint(pages, links),
    [pages, links],
  );
  const documentSignature = useMemo(
    () => JSON.stringify({ pages, links }),
    [pages, links],
  );
  const simulatorDirty = simulator
    ? simulator.sourceSignature !== documentSignature
    : false;

  useEffect(() => {
    clearStyleVariableFallbackCache();
  }, [project.id]);

  const commitPages = (update: SetStateAction<CanvasPage[]>) => {
    commit((current) => {
      const nextPages =
        typeof update === "function"
          ? (update as (items: CanvasPage[]) => CanvasPage[])(
              current.pages,
            )
          : update;
      return nextPages === current.pages
        ? current
        : { ...current, pages: nextPages };
    });
  };

  const transientPages = (update: SetStateAction<CanvasPage[]>) => {
    transient((current) => {
      const nextPages =
        typeof update === "function"
          ? (update as (items: CanvasPage[]) => CanvasPage[])(
              current.pages,
            )
          : update;
      return nextPages === current.pages
        ? current
        : { ...current, pages: nextPages };
    });
  };

  const commitLinks = (update: SetStateAction<CanvasLink[]>) => {
    commit((current) => {
      const nextLinks =
        typeof update === "function"
          ? (update as (items: CanvasLink[]) => CanvasLink[])(
              current.links,
            )
          : update;
      return nextLinks === current.links
        ? current
        : { ...current, links: nextLinks };
    });
  };

  const selectPage = (pageId: string | null) => {
    setSelectedLinkId(null);
    setSelectedPageIds(pageId ? [pageId] : []);
  };

  const selectPages = (pageIds: string[]) => {
    setSelectedLinkId(null);
    setSelectedPageIds(Array.from(new Set(pageIds)));
  };

  const selectLink = (linkId: string) => {
    setSelectedPageIds([]);
    setSelectedLinkId(linkId);
  };

  const handleCreatePage = (page: CanvasPage) => {
    commitPages((current) => [...current, page]);
  };

  const handleRenamePage = (pageId: string, name: string) => {
    commitPages((current) => {
      const target = current.find((page) => page.id === pageId);
      if (!target || target.name === name) return current;

      return current.map((page) =>
        page.id === pageId ? { ...page, name } : page,
      );
    });
  };

  const handleRenamePageId = (pageId: string, nextId: string) => {
    const id = nextId.trim();
    if (!id || id === pageId) return;
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(id) ||
      id.toLowerCase() === "self"
    ) {
      return;
    }
    if (pages.some((page) => page.id === id)) return;

    commit((current) => {
      if (current.pages.some((page) => page.id === id)) return current;

      return {
        pages: current.pages.map((page) => {
          const renamedId = page.id === pageId ? id : page.id;
          const parentId =
            page.parentId === pageId ? id : page.parentId;

          return {
            ...page,
            id: renamedId,
            ...(parentId ? { parentId } : {}),
            styles: renameStyleReferences(page.styles, pageId, id),
          };
        }),
        links: renameLinkReferences(current.links, pageId, id),
      };
    });

    setSelectedPageIds((current) =>
      current.map((selectedId) =>
        selectedId === pageId ? id : selectedId,
      ),
    );
  };

  const deletePages = (pageIds: string[]) => {
    if (!pageIds.length) return;

    const deleting = new Set<string>();
    const stack = [...pageIds];
    while (stack.length) {
      const id = stack.pop();
      if (!id || deleting.has(id)) continue;
      deleting.add(id);
      for (const page of pages) {
        if (page.parentId === id) stack.push(page.id);
      }
    }

    commit((current) => {
      const nextPages = current.pages.filter(
        (page) => !deleting.has(page.id),
      );
      if (nextPages.length === current.pages.length) return current;
      return {
        pages: nextPages,
        links: current.links.filter(
          (link) =>
            !deleting.has(link.fromId) && !deleting.has(link.toId),
        ),
      };
    });
    setSelectedPageIds((current) =>
      current.filter((id) => !deleting.has(id)),
    );
  };

  const handleDeletePage = (pageId: string) => {
    deletePages([pageId]);
  };

  const handleUpdatePageStyles = (
    pageId: string,
    styles: Record<string, string>,
  ) => {
    commitPages((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, styles } : page,
      ),
    );
  };

  const handleUpdatePagePosition = (
    pageId: string,
    x: number,
    y: number,
  ) => {
    commitPages((current) => {
      const target = current.find((page) => page.id === pageId);
      if (!target) return current;

      const targetFrame = getPageFrame(target, current, links);
      const dx = x - targetFrame.worldX;
      const dy = y - targetFrame.worldY;
      if (dx === 0 && dy === 0 && !hasPositionAnchor(target.styles)) {
        return current;
      }

      const descendants = getSubtreeIds(current, pageId);
      descendants.delete(pageId);

      return current.map((page) => {
        if (page.id === pageId) {
          return {
            ...page,
            x,
            y,
            styles: clearPositionAnchors(page.styles),
          };
        }
        if (
          descendants.has(page.id) &&
          !hasPositionAnchor(page.styles)
        ) {
          return { ...page, x: page.x + dx, y: page.y + dy };
        }
        return page;
      });
    });
  };

  const handleUpdatePageWidget = (
    pageId: string,
    widget: CanvasWidget | null,
  ) => {
    commitPages((current) =>
      current.map((page) =>
        page.id === pageId
          ? { ...page, widget: widget ?? undefined }
          : page,
      ),
    );
  };

  const handleUpdatePageBehavior = (
    pageId: string,
    behavior: CanvasBehavior,
  ) => {
    commitPages((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, behavior } : page,
      ),
    );
  };

  const getRunTargets = (containerId: string) => {
    const targets = new Set<string>();
    for (const link of links) {
      if (link.fromId === containerId) targets.add(link.toId);
      if (link.direction === "two-way" && link.toId === containerId) {
        targets.add(link.fromId);
      }
    }
    targets.delete(containerId);
    return [...targets].filter((id) => {
      const page = pages.find((item) => item.id === id);
      return Boolean(page && !page.parentId);
    });
  };

  const openSimulator = (containerId: string, entryPageId: string) => {
    setSimulator({
      snapshot: createRuntimeSnapshot(
        pages,
        links,
        containerId,
        entryPageId,
      ),
      sourceSignature: documentSignature,
      compiling: false,
      progress: 0,
    });
    setRunChoice(null);
  };

  const handleRunPage = (containerId: string) => {
    const targets = getRunTargets(containerId);
    if (targets.length === 0) {
      openSimulator(containerId, containerId);
      return;
    }
    if (targets.length === 1) {
      openSimulator(containerId, targets[0]);
      return;
    }
    setRunChoice({ containerId, candidates: targets });
  };

  const clearCompileTimers = () => {
    if (compileTimerRef.current !== null) {
      window.clearTimeout(compileTimerRef.current);
      compileTimerRef.current = null;
    }
    if (compileDoneTimerRef.current !== null) {
      window.clearTimeout(compileDoneTimerRef.current);
      compileDoneTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearCompileTimers();
  }, []);

  const handleCompileSimulator = () => {
    if (!simulator || simulator.compiling) return;
    clearCompileTimers();
    setSimulator((current) =>
      current ? { ...current, compiling: true, progress: 3 } : current,
    );

    let progress = 3;
    const tick = () => {
      progress = Math.min(
        100,
        progress + 7 + Math.round(Math.random() * 9),
      );
      setSimulator((current) => {
        if (!current) return current;
        if (progress >= 100) {
          const entryPageId = pages.some(
            (page) => page.id === current.snapshot.entryPageId,
          )
            ? current.snapshot.entryPageId
            : current.snapshot.containerId;
          return {
            ...current,
            snapshot: createRuntimeSnapshot(
              pages,
              links,
              current.snapshot.containerId,
              entryPageId,
            ),
            sourceSignature: documentSignature,
            compiling: false,
            progress: 100,
          };
        }
        return { ...current, progress };
      });

      if (progress < 100) {
        compileTimerRef.current = window.setTimeout(tick, 80);
      } else {
        compileDoneTimerRef.current = window.setTimeout(() => {
          setSimulator((current) =>
            current ? { ...current, progress: 0 } : current,
          );
        }, 900);
      }
    };

    compileTimerRef.current = window.setTimeout(tick, 80);
  };

  const handleMovePage = (pageId: string, x: number, y: number) => {
    transientPages((current) => {
      const target = current.find((page) => page.id === pageId);
      if (!target) return current;

      const targetFrame = getPageFrame(target, current, links);
      const dx = x - targetFrame.worldX;
      const dy = y - targetFrame.worldY;
      const targetChanged =
        target.x !== x ||
        target.y !== y ||
        hasPositionAnchor(target.styles);
      const shiftDescendants = dx !== 0 || dy !== 0;
      if (!targetChanged && !shiftDescendants) return current;

      const descendants = getSubtreeIds(current, pageId);
      descendants.delete(pageId);

      return current.map((page) => {
        if (page.id === pageId) {
          return {
            ...page,
            x,
            y,
            styles: clearPositionAnchors(page.styles),
          };
        }
        if (
          shiftDescendants &&
          descendants.has(page.id) &&
          !hasPositionAnchor(page.styles)
        ) {
          return { ...page, x: page.x + dx, y: page.y + dy };
        }
        return page;
      });
    });
  };

  const handleUpdatePageData = (
    pageId: string,
    data: CanvasDataEntry[],
  ) => {
    commitPages((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, data } : page,
      ),
    );
  };

  const handleMovePageStart = () => {
    beginTransaction();
  };

  const handleMovePageEnd = (pageId: string, moved: boolean) => {
    if (moved) {
      transient((current) => {
        const page = current.pages.find((item) => item.id === pageId);
        if (!page) return current;

        const subtreeIds = getSubtreeIds(current.pages, pageId);
        const pageFrame = getPageFrame(
          page,
          current.pages,
          current.links,
        );
        const centerX = pageFrame.worldX + pageFrame.width / 2;
        const centerY = pageFrame.worldY + pageFrame.height / 2;

        let parentPage: CanvasPage | null = null;
        for (let index = current.pages.length - 1; index >= 0; index -= 1) {
          const candidate = current.pages[index];
          if (subtreeIds.has(candidate.id)) continue;
          const frame = getPageFrame(
            candidate,
            current.pages,
            current.links,
          );
          if (
            centerX >= frame.worldX &&
            centerX <= frame.worldX + frame.width &&
            centerY >= frame.worldY &&
            centerY <= frame.worldY + frame.height
          ) {
            parentPage = candidate;
            break;
          }
        }

        const nextParentId = parentPage?.id ?? null;
        if ((page.parentId ?? null) === nextParentId) return current;

        const nextPages = current.pages.map((item) => {
          if (item.id !== pageId) return item;
          if (nextParentId) {
            return { ...item, parentId: nextParentId };
          }
          const next = { ...item };
          delete next.parentId;
          return next;
        });
        const parentedIds = new Set(
          nextPages
            .filter((item) => item.parentId)
            .map((item) => item.id),
        );
        const nextLinks = current.links.filter(
          (link) =>
            !parentedIds.has(link.fromId) &&
            !parentedIds.has(link.toId),
        );

        return {
          pages: nextPages,
          links:
            nextLinks.length === current.links.length
              ? current.links
              : nextLinks,
        };
      });
    }

    endTransaction();
  };

  const handleResizePage = (
    pageId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const target = pages.find((page) => page.id === pageId);
    if (!target || target.lockedSize) return;

    const nextX = Math.round(x);
    const nextY = Math.round(y);
    const layout = getCanvasLayout(pages, links);
    const parent = target.parentId
      ? pages.find((page) => page.id === target.parentId)
      : undefined;
    const parentFrame = parent ? layout.get(parent.id) : null;
    const formatLength = (
      currentValue: string | undefined,
      nextValue: number,
      reference: number | undefined,
    ) => {
      if (
        currentValue?.trim().endsWith("%") &&
        reference !== undefined &&
        reference > 0
      ) {
        const percent = (Math.max(1, nextValue) / reference) * 100;
        return `${Number(percent.toFixed(2))}%`;
      }
      return `${Math.max(1, Math.round(nextValue))}px`;
    };
    const nextWidth = formatLength(
      target.styles.width,
      width,
      parentFrame?.width,
    );
    const nextHeight = formatLength(
      target.styles.height,
      height,
      parentFrame?.height,
    );
    if (
      target.x === nextX &&
      target.y === nextY &&
      target.styles.width === nextWidth &&
      target.styles.height === nextHeight &&
      !hasPositionAnchor(target.styles)
    ) {
      return;
    }

    transientPages((current) =>
      current.map((page) => {
        if (page.id !== pageId || page.lockedSize) return page;

        return {
          ...page,
          x: nextX,
          y: nextY,
          styles: {
            ...clearPositionAnchors(page.styles),
            width: nextWidth,
            height: nextHeight,
          },
        };
      }),
    );
  };

  const handleResizePageStart = () => {
    beginTransaction();
  };

  const handleResizePageEnd = () => {
    endTransaction();
  };

  const handleReorderPage = (
    dragId: string,
    targetId: string,
    position: LayerDropPosition,
  ) => {
    if (dragId === targetId) return;

    commit((current) => {
      const dragPage = current.pages.find((page) => page.id === dragId);
      if (!dragPage) return current;
      const frame = getPageFrame(
        dragPage,
        current.pages,
        current.links,
      );
      const previousParentId = dragPage.parentId ?? null;

      const nextPages = movePageInHierarchy(
        current.pages,
        dragId,
        targetId,
        position,
      );
      if (!nextPages) return current;

      const movedPage = nextPages.find((page) => page.id === dragId);
      if (
        movedPage &&
        (movedPage.parentId ?? null) !== previousParentId
      ) {
        // Reparenting changes the coordinate space. Keep the node visually
        // stable by switching it to world coordinates in the new parent.
        movedPage.x = frame.worldX;
        movedPage.y = frame.worldY;
        movedPage.styles = clearPositionAnchors(movedPage.styles);
      }

      const parentedIds = new Set(
        nextPages
          .filter((page) => page.parentId)
          .map((page) => page.id),
      );
      const nextLinks = current.links.filter(
        (link) =>
          !parentedIds.has(link.fromId) &&
          !parentedIds.has(link.toId),
      );

      return {
        pages: nextPages,
        links:
          nextLinks.length === current.links.length
            ? current.links
            : nextLinks,
      };
    });
  };

  const handleCopyPage = (pageId: string) => {
    const page = pages.find((item) => item.id === pageId);
    if (page) copyPageToClipboard(page);
  };

  const handleCutPage = (pageId: string) => {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;

    copyPageToClipboard(page, "cut");
    handleDeletePage(pageId);
  };

  const normalizePastPosition = (
    page: CanvasPage,
    fallback: { x: number; y: number },
  ): CanvasPage => {
    if (!hasPositionAnchor(page.styles)) return page;
    return {
      ...page,
      x: fallback.x,
      y: fallback.y,
      styles: clearPositionAnchors(page.styles),
    };
  };

  const handlePastePage = (position?: { x: number; y: number }) => {
    const pasted = pastePageFromClipboard(
      pages,
      t("projects.workspace.canvas.copySuffix"),
      position,
    );
    if (!pasted) return;

    const pastedFrame = getPageFrame(pasted, pages, links);
    const normalized = normalizePastPosition(pasted, {
      x: position?.x ?? pastedFrame.worldX + 24,
      y: position?.y ?? pastedFrame.worldY + 24,
    });
    commitPages((current) => [...current, normalized]);
    setSelectedLinkId(null);
    setSelectedPageIds([normalized.id]);
  };

  const handleDuplicatePage = (pageId: string) => {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;

    const duplicate = duplicatePageFrom(
      page,
      pages,
      t("projects.workspace.canvas.copySuffix"),
    );
    const sourceFrame = getPageFrame(page, pages, links);
    const normalized = normalizePastPosition(duplicate, {
      x: sourceFrame.worldX + 24,
      y: sourceFrame.worldY + 24,
    });
    commitPages((current) => [...current, normalized]);
    setSelectedLinkId(null);
    setSelectedPageIds([normalized.id]);
  };

  const handleCreateLink = (
    fromId: string,
    toId: string,
    fromAnchor: CanvasLinkAnchor,
    toAnchor: CanvasLinkAnchor,
  ) => {
    if (fromId === toId) return;
    const id = createLinkId(links);
    commitLinks((current) => [
      ...current,
      {
        id,
        fromId,
        toId,
        direction: "one-way",
        color: DEFAULT_LINK_COLOR,
        width: 2,
        dashed: false,
        fromAnchor,
        toAnchor,
        createdAt: Date.now(),
      },
    ]);
    setSelectedPageIds([]);
    setSelectedLinkId(id);
  };

  const handleUpdateLink = (
    linkId: string,
    patch: Partial<CanvasLink>,
  ) => {
    commitLinks((current) =>
      current.map((link) =>
        link.id === linkId ? { ...link, ...patch } : link,
      ),
    );
  };

  const handleDeleteLink = (linkId: string) => {
    commitLinks((current) =>
      current.filter((link) => link.id !== linkId),
    );
    setSelectedLinkId((current) => (current === linkId ? null : current));
  };

  useEffect(() => {
    setSelectedPageIds((current) => {
      const next = current.filter((id) =>
        pages.some((page) => page.id === id),
      );
      return next.length === current.length ? current : next;
    });
  }, [pages]);

  useEffect(() => {
    if (
      selectedLinkId &&
      !links.some((link) => link.id === selectedLinkId)
    ) {
      setSelectedLinkId(null);
    }
  }, [links, selectedLinkId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (document.body.dataset.canvasModal === "true") return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedLinkId) {
          event.preventDefault();
          handleDeleteLink(selectedLinkId);
          return;
        }

        if (!selectedPageIds.length) return;
        event.preventDefault();
        deletePages(selectedPageIds);
        return;
      }

      const key = event.key.toUpperCase();
      if (key === CANVAS_TOOL_SHORTCUTS.select) {
        setActiveTool("select");
      } else if (key === CANVAS_TOOL_SHORTCUTS.move) {
        setActiveTool("move");
      } else if (key === CANVAS_TOOL_SHORTCUTS.hand) {
        setActiveTool("hand");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLinkId, selectedPageIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.repeat) return;
      if (isEditableTarget(event.target)) return;
      if (document.body.dataset.canvasModal === "true") return;

      const key = event.key.toLowerCase();

      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (key === "y") {
        event.preventDefault();
        redo();
        return;
      }

      const selectedPage = selectedPageId
        ? pages.find((page) => page.id === selectedPageId)
        : null;

      if (key === "c") {
        if (!selectedPage) return;
        event.preventDefault();
        handleCopyPage(selectedPage.id);
        return;
      }

      if (key === "x") {
        if (!selectedPage) return;
        event.preventDefault();
        handleCutPage(selectedPage.id);
        return;
      }

      if (key === "v") {
        if (!hasPageClipboard()) return;
        event.preventDefault();
        handlePastePage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pages, selectedPageId, t]);

  const selectedLink =
    links.find((link) => link.id === selectedLinkId) ?? null;

  return (
    <div className={styles.shell} data-project-workspace="true">
      <ProjectWorkspaceTopBar project={project} onExit={onExit} />

      <div className={styles.body}>
        <CanvasLeftSidebar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          projectType={project.type}
          snapSettings={snapSettings}
          onSnapSettingsChange={setSnapSettings}
        />

        <CanvasViewport
          label={project.name}
          activeTool={activeTool}
          pages={pages}
          links={links}
          selectedIds={selectedPageIds}
          selectedLinkId={selectedLinkId}
          snapSettings={snapSettings}
          onSelectPage={selectPage}
          onSelectPages={selectPages}
          onSelectLink={selectLink}
          onCreatePage={handleCreatePage}
          onCreateLink={handleCreateLink}
          onDeleteLink={handleDeleteLink}
          onMovePage={handleMovePage}
          onMovePageStart={handleMovePageStart}
          onMovePageEnd={handleMovePageEnd}
          onResizePage={handleResizePage}
          onResizePageStart={handleResizePageStart}
          onResizePageEnd={handleResizePageEnd}
          onRenamePage={handleRenamePage}
          onDeletePage={handleDeletePage}
          onCopyPage={handleCopyPage}
          onCutPage={handleCutPage}
          onDuplicatePage={handleDuplicatePage}
          onPastePage={handlePastePage}
          onRunPage={handleRunPage}
        />

        <CanvasRightSidebar
          pages={pages}
          links={links}
          selectedId={selectedPageId}
          selectedIds={selectedPageIds}
          selectedLink={selectedLink}
          onSelect={selectPage}
          onUpdateLink={handleUpdateLink}
          onDeleteLink={handleDeleteLink}
          onRename={handleRenamePage}
          onRenameId={handleRenamePageId}
          onDelete={handleDeletePage}
          onUpdateStyles={handleUpdatePageStyles}
          onUpdatePosition={handleUpdatePagePosition}
          onUpdateWidget={handleUpdatePageWidget}
          onUpdateData={handleUpdatePageData}
          onOpenBehaviorEditor={(pageId) => {
            setSelectedPageIds([pageId]);
            setSelectedLinkId(null);
            setBehaviorEditorOpen(true);
            setLintOpen(false);
          }}
          onReorder={handleReorderPage}
        />
      </div>

      {behaviorEditorOpen ? (
        <CanvasBehaviorEditor
          pages={pages}
          pageId={selectedPageId}
          height={lintHeight}
          onHeightChange={setLintHeight}
          onClose={() => setBehaviorEditorOpen(false)}
          onUpdateBehavior={handleUpdatePageBehavior}
        />
      ) : lintOpen ? (
        <CanvasLintPanel
          items={lintItems}
          height={lintHeight}
          onHeightChange={setLintHeight}
          onClose={() => setLintOpen(false)}
        />
      ) : null}

      {runChoice ? (
        <div
          className={styles.runChoiceOverlay}
          role="presentation"
          onClick={() => setRunChoice(null)}
        >
          <div
            className={styles.runChoiceDialog}
            role="dialog"
            aria-modal="true"
            aria-label={t("projects.workspace.simulator.chooseEntry")}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.runChoiceHeader}>
              <div>
                <h2>{t("projects.workspace.simulator.chooseEntry")}</h2>
                <p>{t("projects.workspace.simulator.chooseEntryHint")}</p>
              </div>
              <button
                className={styles.runChoiceClose}
                type="button"
                aria-label={t("projects.workspace.simulator.cancel")}
                onClick={() => setRunChoice(null)}
              >
                ×
              </button>
            </header>
            <div className={styles.runChoiceList}>
              {runChoice.candidates.map((candidateId) => {
                const candidate = pages.find(
                  (page) => page.id === candidateId,
                );
                if (!candidate) return null;
                return (
                  <button
                    className={styles.runChoiceItem}
                    type="button"
                    key={candidateId}
                    onClick={() =>
                      openSimulator(runChoice.containerId, candidateId)
                    }
                  >
                    <span className={styles.runChoicePreview}>
                      {candidate.name.slice(0, 1)}
                    </span>
                    <span className={styles.runChoiceInfo}>
                      <strong>{candidate.name}</strong>
                      <span>
                        {candidate.styles.width ?? "800px"} ×{" "}
                        {candidate.styles.height ?? "800px"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {simulator ? (
        <CanvasSimulator
          snapshot={simulator.snapshot}
          dirty={simulatorDirty}
          compiling={simulator.compiling}
          compileProgress={simulator.progress}
          onCompile={handleCompileSimulator}
          onClose={() => {
            clearCompileTimers();
            setSimulator(null);
          }}
        />
      ) : null}

      <footer className={styles.statusBar}>
        {simulator && (simulator.compiling || simulator.progress > 0) ? (
          <div className={styles.compileStatus}>
            <span className={styles.compileStatusLabel}>
              {simulator.compiling
                ? t("projects.workspace.simulator.compiling", {
                    progress: simulator.progress,
                  })
                : t("projects.workspace.simulator.compileComplete")}
            </span>
            <span className={styles.compileTrack}>
              <span
                className={styles.compileFill}
                style={{ width: `${simulator.progress}%` }}
              />
            </span>
            <span className={styles.compilePercent}>
              {simulator.progress}%
            </span>
          </div>
        ) : null}
        <button
          className={styles.lintStatusButton}
          type="button"
          data-active={lintOpen}
          data-clean={lintItems.length === 0}
          onClick={() => {
            setBehaviorEditorOpen(false);
            setLintOpen((current) => !current);
          }}
          aria-expanded={lintOpen}
          aria-label={
            lintItems.length
              ? t("projects.workspace.lint.open", {
                  count: lintItems.length,
                })
              : t("projects.workspace.lint.noProblems")
          }
        >
          {lintItems.length ? (
            <>
              <span className={styles.lintStatusMark}>×</span>
              <span>{lintItems.length}</span>
            </>
          ) : (
            <>
              <span className={styles.lintStatusCheck}>✓</span>
              <span>{t("projects.workspace.lint.noProblems")}</span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
}
