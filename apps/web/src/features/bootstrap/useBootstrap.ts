import { useCallback, useEffect, useRef, useState } from "react";

import { i18n } from "../../lib/i18n";
import {
  createLoadingProgressController,
  useLoadingProgress,
  type LoadingProgressController,
} from "../../lib/loading";
import {
  runBootstrap,
  workspaceBootstrapTasks,
  type BootstrapTask,
} from "./bootstrap";

export type BootstrapStatus = "idle" | "loading" | "error" | "success";

function createBootstrapController(): LoadingProgressController {
  return createLoadingProgressController({
    status: "loading",
    progress: 0,
    label: i18n.t("loading.tasks.workspace"),
    footer: i18n.t("loading.footer"),
  });
}

export function useBootstrap(
  tasks: readonly BootstrapTask[] = workspaceBootstrapTasks,
) {
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<LoadingProgressController | null>(null);
  const taskLabelKeyRef = useRef("loading.tasks.workspace");

  if (!controllerRef.current) {
    controllerRef.current = createBootstrapController();
  }

  const controller = controllerRef.current;
  const snapshot = useLoadingProgress(controller);

  useEffect(() => {
    const syncCopy = () => {
      controller.setCopy({
        label: i18n.t(taskLabelKeyRef.current),
        footer: i18n.t("loading.footer"),
      });
    };

    i18n.on("languageChanged", syncCopy);
    return () => {
      i18n.off("languageChanged", syncCopy);
    };
  }, [controller]);

  useEffect(() => {
    const abort = new AbortController();

    controller.start({
      progress: 0,
      label: i18n.t("loading.tasks.workspace"),
      footer: i18n.t("loading.footer"),
    });

    runBootstrap(
      tasks,
      (update) => {
        if (abort.signal.aborted) return;
        taskLabelKeyRef.current = update.taskLabelKey;
        controller.report(update.progress, {
          label: i18n.t(update.taskLabelKey),
        });
      },
      abort.signal,
    )
      .then(() => {
        if (!abort.signal.aborted) controller.finish();
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error("[morfa] bootstrap failed", error);
        controller.fail(
          error instanceof Error ? error.message : String(error),
        );
      });

    return () => abort.abort();
  }, [attempt, tasks, controller]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return {
    controller,
    status: snapshot.status,
    retry,
  };
}
