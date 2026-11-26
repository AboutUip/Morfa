import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectSummary } from "../../lib/api";
import {
  copyPageToClipboard,
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
import type { CanvasPage } from "./canvasDocument";
import { useCanvasSnapSettings } from "./canvasSnap";
import { ProjectWorkspaceTopBar } from "./ProjectWorkspaceTopBar";
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
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key.toUpperCase();
      if (key === CANVAS_TOOL_SHORTCUTS.select) {
        setActiveTool("select");
      } else if (key === CANVAS_TOOL_SHORTCUTS.hand) {
        setActiveTool("hand");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.repeat) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const selectedPage = selectedPageId
        ? pages.find((page) => page.id === selectedPageId)
        : null;

      if (key === "c") {
        if (!selectedPage) return;
        event.preventDefault();
        copyPageToClipboard(selectedPage);
        return;
      }

      if (key === "x") {
        if (!selectedPage) return;
        event.preventDefault();
        copyPageToClipboard(selectedPage, "cut");
        setPages((current) =>
          current.filter((page) => page.id !== selectedPage.id),
        );
        setSelectedPageId(null);
        return;
      }

      if (key === "v") {
        if (!hasPageClipboard()) return;
        event.preventDefault();
        const pasted = pastePageFromClipboard(
          pages,
          t("projects.workspace.canvas.copySuffix"),
        );
        if (!pasted) return;
        setPages((current) => [...current, pasted]);
        setSelectedPageId(pasted.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pages, selectedPageId, setPages, t]);

  const handleCreatePage = (page: CanvasPage) => {
    setPages((current) => [...current, page]);
  };

  const handleRenamePage = (pageId: string, name: string) => {
    setPages((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, name } : page,
      ),
    );
  };

  const handleDeletePage = (pageId: string) => {
    setPages((current) => current.filter((page) => page.id !== pageId));
    setSelectedPageId((current) => (current === pageId ? null : current));
  };

  const handleUpdatePageStyles = (
    pageId: string,
    styles: Record<string, string>,
  ) => {
    setPages((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, styles } : page,
      ),
    );
  };

  const handleMovePage = (pageId: string, x: number, y: number) => {
    setPages((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, x, y } : page,
      ),
    );
  };

  const handleReorderPage = (
    dragId: string,
    targetId: string,
    position: "before" | "after",
  ) => {
    if (dragId === targetId) return;

    setPages((current) => {
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
        />

        <CanvasRightSidebar
          pages={pages}
          selectedId={selectedPageId}
          onSelect={setSelectedPageId}
          onRename={handleRenamePage}
          onDelete={handleDeletePage}
          onUpdateStyles={handleUpdatePageStyles}
          onReorder={handleReorderPage}
        />
      </div>

      <footer className={styles.statusBar} />
    </div>
  );
}
