import { useEffect, useState } from "react";

import type { ProjectSummary } from "../../lib/api";
import { CanvasLeftSidebar } from "./CanvasLeftSidebar";
import { CanvasRightSidebar } from "./CanvasRightSidebar";
import { CanvasViewport } from "./CanvasViewport";
import {
  CANVAS_TOOL_SHORTCUTS,
  type CanvasTool,
} from "./canvasTools";
import type { CanvasPage } from "./canvasDocument";
import { ProjectWorkspaceTopBar } from "./ProjectWorkspaceTopBar";
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
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [pages, setPages] = useState<CanvasPage[]>([]);
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
        />

        <CanvasViewport
          label={project.name}
          activeTool={activeTool}
          pages={pages}
          selectedId={selectedPageId}
          onSelectPage={setSelectedPageId}
          onCreatePage={handleCreatePage}
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
