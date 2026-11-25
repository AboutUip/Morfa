/**
 * 启动流程（bootstrap）。
 *
 * 当前阶段只有一个固定 3 秒的占位任务。后续接入真实初始化时：
 * - 把 workspaceBootstrapTasks 替换为会话、项目、设计文档等异步任务；
 * - 在任务内部调用 report(0..1) 上报真实进度；
 * - runBootstrap 会按 weight 汇总总体进度，并保持单调递增。
 */

export interface BootstrapTaskContext {
  report: (progress: number) => void;
  signal: AbortSignal;
}

export interface BootstrapTask {
  id: string;
  /** i18n 文案键，例如 loading.tasks.workspace */
  labelKey: string;
  /** 进度权重，默认 1 */
  weight?: number;
  run: (context: BootstrapTaskContext) => Promise<void>;
}

export interface BootstrapUpdate {
  progress: number;
  taskId: string;
  taskLabelKey: string;
}

const PLACEHOLDER_DURATION_MS = 3_000;

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException("Bootstrap aborted", "AbortError");
  }
}

export async function runBootstrap(
  tasks: readonly BootstrapTask[],
  onUpdate: (update: BootstrapUpdate) => void,
  signal: AbortSignal,
): Promise<void> {
  const totalWeight = tasks.reduce((total, task) => total + (task.weight ?? 1), 0);
  let completedWeight = 0;
  let lastUpdate: BootstrapUpdate = {
    progress: 0,
    taskId: "",
    taskLabelKey: "loading.tasks.workspace",
  };

  for (const task of tasks) {
    throwIfAborted(signal);

    const weight = task.weight ?? 1;
    let taskProgress = 0;

    const report = (value: number) => {
      taskProgress = Math.max(taskProgress, clamp(value));
      const progress =
        totalWeight > 0
          ? clamp((completedWeight + taskProgress * weight) / totalWeight)
          : 0;

      lastUpdate = {
        progress,
        taskId: task.id,
        taskLabelKey: task.labelKey,
      };
      onUpdate(lastUpdate);
    };

    report(0);
    await task.run({ report, signal });
    throwIfAborted(signal);

    completedWeight += weight;
    onUpdate({
      progress: totalWeight > 0 ? clamp(completedWeight / totalWeight) : 1,
      taskId: task.id,
      taskLabelKey: task.labelKey,
    });
  }

  onUpdate({ ...lastUpdate, progress: 1 });
}

function simulateProgress(
  durationMs: number,
  { report, signal }: BootstrapTaskContext,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    let frame = 0;

    const cleanup = () => {
      if (frame) cancelAnimationFrame(frame);
      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Bootstrap aborted", "AbortError"));
    };

    const tick = (now: number) => {
      if (signal.aborted) return;

      const progress = Math.min(1, Math.max(0, (now - start) / durationMs));
      report(progress);

      if (progress >= 1) {
        cleanup();
        resolve();
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    if (signal.aborted) {
      reject(new DOMException("Bootstrap aborted", "AbortError"));
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
    report(0);
    frame = requestAnimationFrame(tick);
  });
}

/**
 * 当前占位任务：固定 3 秒。
 * 接入网络初始化后，用真实任务替换这个数组即可，加载界面无需改动。
 */
export const workspaceBootstrapTasks: readonly BootstrapTask[] = [
  {
    id: "workspace",
    labelKey: "loading.tasks.workspace",
    weight: 1,
    run: (context) => simulateProgress(PLACEHOLDER_DURATION_MS, context),
  },
];
