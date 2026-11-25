import { useCallback, useEffect, useState } from "react";

import {
  runBootstrap,
  workspaceBootstrapTasks,
  type BootstrapTask,
} from "./bootstrap";

export type BootstrapStatus = "loading" | "ready" | "error";

interface BootstrapState {
  status: BootstrapStatus;
  progress: number;
  taskLabelKey: string;
  error: string | null;
}

const initialState: BootstrapState = {
  status: "loading",
  progress: 0,
  taskLabelKey: "loading.tasks.workspace",
  error: null,
};

export function useBootstrap(
  tasks: readonly BootstrapTask[] = workspaceBootstrapTasks,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootstrapState>(initialState);

  useEffect(() => {
    const controller = new AbortController();
    setState(initialState);

    runBootstrap(
      tasks,
      (update) => {
        if (controller.signal.aborted) return;
        setState({
          status: "loading",
          progress: update.progress,
          taskLabelKey: update.taskLabelKey,
          error: null,
        });
      },
      controller.signal,
    )
      .then(() => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          status: "ready",
          progress: 1,
          error: null,
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;

        console.error("[morfa] bootstrap failed", error);
        setState((current) => ({
          ...current,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        }));
      });

    return () => controller.abort();
  }, [attempt, tasks]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { ...state, retry };
}
