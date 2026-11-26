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
import {
  CANVAS_TOOL_SHORTCUTS,
  type CanvasTool,
} from "./canvasTools";
import {
  clearStyleVariableFallbackCache,
  collectCanvasLint,
  createLinkId,
  renameLinkReferences,
  renameStyleReferences,
  type CanvasDataEntry,
  type CanvasLink,
  type CanvasLinkAnchor,
  type CanvasLintItem,
  type CanvasPage,
  type CanvasWidget,
} from "./canvasDocument";
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
  const [lintHeight, setLintHeight] = useState(220);
  const selectedPageId =
    selectedPageIds[selectedPageIds.length - 1] ?? null;
  const lintItems = useMemo(
    () => collectCanvasLint(pages, links),
    [pages, links],
  );

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
    const deleting = new Set(pageIds);
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

  const handleMovePage = (pageId: string, x: number, y: number) => {
    transientPages((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, x, y } : page,
      ),
    );
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

  const handleMovePageEnd = () => {
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
    const nextWidth = `${Math.max(1, Math.round(width))}px`;
    const nextHeight = `${Math.max(1, Math.round(height))}px`;
    if (
      target.x === nextX &&
      target.y === nextY &&
      target.styles.width === nextWidth &&
      target.styles.height === nextHeight
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
            ...page.styles,
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
    position: "before" | "after",
  ) => {
    if (dragId === targetId) return;

    commitPages((current) => {
      const fromIndex = current.findIndex((page) => page.id === dragId);
      if (fromIndex < 0) return current;

      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      let targetIndex = next.findIndex((page) => page.id === targetId);
      if (targetIndex < 0) return current;

      if (position === "after") targetIndex += 1;
      next.splice(targetIndex, 0, moved);
      return next;
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

  const handlePastePage = (position?: { x: number; y: number }) => {
    const pasted = pastePageFromClipboard(
      pages,
      t("projects.workspace.canvas.copySuffix"),
      position,
    );
    if (!pasted) return;

    commitPages((current) => [...current, pasted]);
    setSelectedLinkId(null);
    setSelectedPageIds([pasted.id]);
  };

  const handleDuplicatePage = (pageId: string) => {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;

    const duplicate = duplicatePageFrom(
      page,
      pages,
      t("projects.workspace.canvas.copySuffix"),
    );
    commitPages((current) => [...current, duplicate]);
    setSelectedLinkId(null);
    setSelectedPageIds([duplicate.id]);
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
          onUpdateWidget={handleUpdatePageWidget}
          onUpdateData={handleUpdatePageData}
          onReorder={handleReorderPage}
        />
      </div>

      {lintOpen ? (
        <CanvasLintPanel
          items={lintItems}
          height={lintHeight}
          onHeightChange={setLintHeight}
          onClose={() => setLintOpen(false)}
        />
      ) : null}

      <footer className={styles.statusBar}>
        <button
          className={styles.lintStatusButton}
          type="button"
          data-active={lintOpen}
          data-clean={lintItems.length === 0}
          onClick={() => setLintOpen((current) => !current)}
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
