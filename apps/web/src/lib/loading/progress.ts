import { useSyncExternalStore } from "react";

export type LoadingStatus = "idle" | "loading" | "error" | "success";

export interface LoadingProgressSnapshot {
  status: LoadingStatus;
  progress: number;
  label: string;
  footer: string;
  error: string | null;
}

export interface LoadingProgressInit {
  status?: LoadingStatus;
  progress?: number;
  label?: string;
  footer?: string;
  error?: string | null;
}

export interface LoadingCopyPatch {
  label?: string;
  footer?: string;
}

type Listener = () => void;

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * 可被任意异步任务写入、任意组件订阅的加载进度源。
 *
 * 生产者：start / report / setCopy / fail / finish / reset
 * 消费者：subscribe / getSnapshot / useLoadingProgress
 */
export class LoadingProgressController {
  private snapshot: LoadingProgressSnapshot;
  private readonly listeners = new Set<Listener>();

  constructor(init: LoadingProgressInit = {}) {
    this.snapshot = {
      status: init.status ?? "idle",
      progress: clampProgress(init.progress ?? 0),
      label: init.label ?? "",
      footer: init.footer ?? "",
      error: init.error ?? null,
    };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LoadingProgressSnapshot => this.snapshot;

  start(options: LoadingCopyPatch & { progress?: number } = {}) {
    this.update({
      status: "loading",
      progress: clampProgress(options.progress ?? 0),
      label: options.label ?? this.snapshot.label,
      footer: options.footer ?? this.snapshot.footer,
      error: null,
    });
  }

  report(progress: number, copy: LoadingCopyPatch = {}) {
    const nextProgress = clampProgress(progress);
    const progressValue =
      this.snapshot.status === "loading"
        ? Math.max(this.snapshot.progress, nextProgress)
        : nextProgress;

    this.update({
      status: this.snapshot.status === "idle" ? "loading" : this.snapshot.status,
      progress: progressValue,
      label: copy.label ?? this.snapshot.label,
      footer: copy.footer ?? this.snapshot.footer,
    });
  }

  setCopy(copy: LoadingCopyPatch) {
    this.update({
      label: copy.label ?? this.snapshot.label,
      footer: copy.footer ?? this.snapshot.footer,
    });
  }

  fail(error: string, copy: LoadingCopyPatch = {}) {
    this.update({
      status: "error",
      error,
      label: copy.label ?? this.snapshot.label,
      footer: copy.footer ?? this.snapshot.footer,
    });
  }

  finish(copy: LoadingCopyPatch = {}) {
    this.update({
      status: "success",
      progress: 1,
      label: copy.label ?? this.snapshot.label,
      footer: copy.footer ?? this.snapshot.footer,
      error: null,
    });
  }

  reset(init: LoadingProgressInit = {}) {
    this.update({
      status: init.status ?? "idle",
      progress: clampProgress(init.progress ?? 0),
      label: init.label ?? "",
      footer: init.footer ?? "",
      error: init.error ?? null,
    });
  }

  private update(patch: Partial<LoadingProgressSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function createLoadingProgressController(
  init: LoadingProgressInit = {},
): LoadingProgressController {
  return new LoadingProgressController(init);
}

export function useLoadingProgress(
  controller: LoadingProgressController,
): LoadingProgressSnapshot {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
}
