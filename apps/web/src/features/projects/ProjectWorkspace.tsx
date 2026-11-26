import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { LoadingOverlay } from "../../components/LoadingOverlay";
import type { ProjectSummary } from "../../lib/api";
import { createLoadingProgressController } from "../../lib/loading";
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
  const [controller] = useState(() =>
    createLoadingProgressController({
      status: "loading",
      progress: 0,
      label: t("projects.workspace.loadingLabel"),
    }),
  );

  useEffect(() => {
    let cancelled = false;

    // 项目内的数据请求、预热与阻塞加载统一接在这里。
    // 全部完成后再调用 finish；失败时调用 fail。
    const prepare = () => {
      if (cancelled) return;
      controller.finish();
    };

    prepare();
    return () => {
      cancelled = true;
    };
  }, [controller]);

  return (
    <div className={styles.shell} data-project-workspace="true">
      <ProjectWorkspaceTopBar project={project} onExit={onExit} />

      <main
        id="project-main"
        className={styles.main}
        tabIndex={-1}
        aria-label={project.name}
      />

      <LoadingOverlay
        controller={controller}
        title={t("projects.workspace.loadingTitle")}
        description={t("projects.workspace.loadingHint", {
          name: project.name,
        })}
        label={t("projects.workspace.loadingLabel")}
        progressLabel={t("projects.workspace.loadingTitle")}
      />
    </div>
  );
}
