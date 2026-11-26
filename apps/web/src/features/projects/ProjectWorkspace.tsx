import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectSummary } from "../../lib/api";
import { CanvasLeftSidebar } from "./CanvasLeftSidebar";
import { CanvasViewport } from "./CanvasViewport";
import {
  CANVAS_TOOL_SHORTCUTS,
  type CanvasTool,
} from "./canvasTools";
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
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");

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

  return (
    <div className={styles.shell} data-project-workspace="true">
      <ProjectWorkspaceTopBar project={project} onExit={onExit} />

      <div className={styles.body}>
        <CanvasLeftSidebar
          activeTool={activeTool}
          onToolChange={setActiveTool}
        />

        <CanvasViewport label={project.name} activeTool={activeTool} />

        <aside
          className={`${styles.sidebar} ${styles.sidebarEnd}`}
          aria-label={t("projects.workspace.inspector")}
        />
      </div>

      <footer className={styles.statusBar} />
    </div>
  );
}
