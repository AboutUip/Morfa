import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { LoadingOverlay } from "../../components/LoadingOverlay";
import { createLoadingProgressController } from "../../lib/loading";
import { useProjects } from "../../lib/projects";
import { useAuth } from "../auth/AuthProvider";
import { ProjectWorkspace } from "./ProjectWorkspace";

interface ProjectEntryProps {
  projectId: string;
  onExit: () => void;
  onMissing: () => void;
}

export function ProjectEntry({
  projectId,
  onExit,
  onMissing,
}: ProjectEntryProps) {
  const { t } = useTranslation();
  const { user, status: authStatus } = useAuth();
  const projectState = useProjects();
  const [controller] = useState(() =>
    createLoadingProgressController({
      status: "loading",
      progress: 0,
      label: t("projects.workspace.loadingLabel"),
    }),
  );

  const project =
    user && projectState.loadedFor === user.id
      ? (projectState.projects.find((item) => item.id === projectId) ?? null)
      : null;
  const projectsReady =
    user !== null &&
    projectState.loadedFor === user.id &&
    projectState.status === "ready";
  const projectsFailed =
    user !== null &&
    projectState.loadedFor === user.id &&
    projectState.status === "error";

  useEffect(() => {
    if (!project) return;

    // 项目内的数据请求、预热与阻塞加载统一接在这里。
    // 全部完成后再调用 finish；失败时调用 fail。
    controller.finish();
  }, [controller, project]);

  useEffect(() => {
    if (authStatus === "ready" && !user) {
      onMissing();
      return;
    }

    if ((projectsReady && !project) || (projectsFailed && !project)) {
      onMissing();
    }
  }, [authStatus, onMissing, project, projectsFailed, projectsReady, user]);

  return (
    <>
      {project ? (
        <ProjectWorkspace project={project} onExit={onExit} />
      ) : null}

      <LoadingOverlay
        controller={controller}
        title={t("projects.workspace.loadingTitle")}
        description={
          project
            ? t("projects.workspace.loadingHint", { name: project.name })
            : undefined
        }
        label={t("projects.workspace.loadingLabel")}
        progressLabel={t("projects.workspace.loadingTitle")}
      />
    </>
  );
}
