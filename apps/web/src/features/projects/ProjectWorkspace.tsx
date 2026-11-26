import { useEffect, useState } from "react";
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
  renameStyleReferences,
  type CanvasDataEntry,
  type CanvasPage,
} from "./canvasDocument";
import { useCanvasSnapSettings } from "./canvasSnap";
import { ProjectWorkspaceTopBar } from "./ProjectWorkspaceTopBar";
import { useCanvasHistory } from "./useCanvasHistory";
import { useProjectCanvas } from "./useProjectCanvas";
import styles from "./ProjectWorkspace.module.css";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
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
  const { pages, setPages } = useProjectCanvas(project.id);
  const {
    commit,
    transient,
    beginTransaction,
    endTransaction,
    undo,
    redo,
  } = useCanvasHistory(pages, setPages, project.id);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const selectedPageId =
    selectedPageIds[selectedPageIds.length - 1] ?? null;

  const selectPage = (pageId: string | null) => {
    setSelectedPageIds(pageId ? [pageId] : []);
  };

  const selectPages = (pageIds: string[]) => {
    setSelectedPageIds(Array.from(new Set(pageIds)));
  };

  const handleCreatePage = (page: CanvasPage) => {
    commit((current) => [...current, page]);
  };

  const handleRenamePage = (pageId: string, name: string) => {
    commit((current) => {
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
      if (current.some((page) => page.id === id)) return current;

      return current.map((page) => {
        const renamedId = page.id === pageId ? id : page.id;
        const parentId =
          page.parentId === pageId ? id : page.parentId;

        return {
          ...page,
          id: renamedId,
          ...(parentId ? { parentId } : {}),
          styles: renameStyleReferences(page.styles, pageId, id),
        };
      });
    });

    setSelectedPageIds((current) =>
      current.map((selectedId) =>
        selectedId === pageId ? id : selectedId,
      ),
    );
  };

  const handleDeletePage = (pageId: string) => {
    commit((current) => {
      if (!current.some((page) => page.id === pageId)) return current;
      return current.filter((page) => page.id !== pageId);
    });
    setSelectedPageIds((current) =>
      current.filter((selectedId) => selectedId !== pageId),
    );
  };

  const handleUpdatePageStyles = (
    pageId: string,
    styles: Record<string, string>,
  ) => {
    commit((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, styles } : page,
      ),
    );
  };

  const handleMovePage = (pageId: string, x: number, y: number) => {
    transient((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, x, y } : page,
      ),
    );
  };

  const handleUpdatePageData = (
    pageId: string,
    data: CanvasDataEntry[],
  ) => {
    commit((current) =>
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

  const handleReorderPage = (
    dragId: string,
    targetId: string,
    position: "before" | "after",
  ) => {
    if (dragId === targetId) return;

    commit((current) => {
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

    commit((current) => [...current, pasted]);
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
    commit((current) => [...current, duplicate]);
    setSelectedPageIds([duplicate.id]);
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (document.body.dataset.canvasModal === "true") return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedPageIds.length) return;
        event.preventDefault();
        const deleting = new Set(selectedPageIds);
        commit((current) => {
          if (!current.some((page) => deleting.has(page.id))) {
            return current;
          }
          return current.filter((page) => !deleting.has(page.id));
        });
        setSelectedPageIds([]);
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
  }, [selectedPageIds]);

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
          selectedIds={selectedPageIds}
          snapSettings={snapSettings}
          onSelectPage={selectPage}
          onSelectPages={selectPages}
          onCreatePage={handleCreatePage}
          onMovePage={handleMovePage}
          onMovePageStart={handleMovePageStart}
          onMovePageEnd={handleMovePageEnd}
          onRenamePage={handleRenamePage}
          onDeletePage={handleDeletePage}
          onCopyPage={handleCopyPage}
          onCutPage={handleCutPage}
          onDuplicatePage={handleDuplicatePage}
          onPastePage={handlePastePage}
        />

        <CanvasRightSidebar
          pages={pages}
          selectedId={selectedPageId}
          selectedIds={selectedPageIds}
          onSelect={selectPage}
          onRename={handleRenamePage}
          onRenameId={handleRenamePageId}
          onDelete={handleDeletePage}
          onUpdateStyles={handleUpdatePageStyles}
          onUpdateData={handleUpdatePageData}
          onReorder={handleReorderPage}
        />
      </div>

      <footer className={styles.statusBar} />
    </div>
  );
}
