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
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    null,
  );

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

    setSelectedPageId((current) =>
      current === pageId ? id : current,
    );
  };

  const handleDeletePage = (pageId: string) => {
    commit((current) => {
      if (!current.some((page) => page.id === pageId)) return current;
      return current.filter((page) => page.id !== pageId);
    });
    setSelectedPageId((current) => (current === pageId ? null : current));
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
    setSelectedPageId(pasted.id);
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
    setSelectedPageId(duplicate.id);
  };

  useEffect(() => {
    if (
      selectedPageId &&
      !pages.some((page) => page.id === selectedPageId)
    ) {
      setSelectedPageId(null);
    }
  }, [pages, selectedPageId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedPageId) return;
        event.preventDefault();
        handleDeletePage(selectedPageId);
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
  }, [selectedPageId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.repeat) return;
      if (isEditableTarget(event.target)) return;

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
          selectedId={selectedPageId}
          snapSettings={snapSettings}
          onSelectPage={setSelectedPageId}
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
          onSelect={setSelectedPageId}
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
