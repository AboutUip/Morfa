import { useTranslation } from "react-i18next";

import type { ProjectSummary } from "../../lib/api";
import { CanvasViewport } from "./CanvasViewport";
import { ProjectWorkspaceTopBar } from "./ProjectWorkspaceTopBar";
import styles from "./ProjectWorkspace.module.css";

interface ProjectWorkspaceProps {
  project: ProjectSummary;
  onExit: () => void;
}

export function ProjectWorkspace({
  project,
  onExit,
}: ProjectWorkspaceProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.shell} data-project-workspace="true">
      <ProjectWorkspaceTopBar project={project} onExit={onExit} />

      <div className={styles.body}>
        <aside
          className={styles.sidebar}
          aria-label={t("projects.workspace.sidebar")}
        />

        <CanvasViewport label={project.name} />

        <aside
          className={`${styles.sidebar} ${styles.sidebarEnd}`}
          aria-label={t("projects.workspace.inspector")}
        />
      </div>

      <footer className={styles.statusBar} />
    </div>
  );
}
