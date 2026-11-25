import { useSyncExternalStore } from "react";

export type BootTaskStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "skipped"
  | "blocked";

export type BootSchedulerStatus = "idle" | "running" | "done";

export type BootTaskPriority = "critical" | "high" | "normal" | "low";

export interface BootTaskContext {
  /** 读取已完成任务的结果；未完成或未注册时返回 undefined。 */
  get<T = unknown>(taskId: string): T | undefined;
  /** 读取任务状态。 */
  status(taskId: string): BootTaskStatus | undefined;
}

export interface BootTask<T = unknown> {
  /** 全应用唯一，重复注册会直接报错。 */
  id: string;
  /** 数字越小越先执行，默认 normal。 */
  priority?: BootTaskPriority;
  /** 依赖任务全部成功或跳过后才会执行，可跨任务并行。 */
  dependsOn?: string[];
  /** 依赖满足后判断本次启动是否需要执行。 */
  enabled?: (context: BootTaskContext) => boolean;
  /** 实际请求或初始化逻辑。 */
  run: (context: BootTaskContext) => Promise<T> | T;
  /** 超时时间，默认不限制。 */
  timeoutMs?: number;
  /** 失败重试次数，默认 0。 */
  retries?: number;
  retryDelayMs?: number;
}

export interface BootTaskSnapshot {
  id: string;
  priority: BootTaskPriority;
  status: BootTaskStatus;
  error: string | null;
  attempts: number;
}

export interface BootSchedulerSnapshot {
  status: BootSchedulerStatus;
  startedAt: number | null;
  finishedAt: number | null;
  tasks: BootTaskSnapshot[];
  completed: number;
  total: number;
}

interface TaskWaiter {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

interface TaskRecord {
  task: BootTask;
  status: BootTaskStatus;
  value?: unknown;
  error?: unknown;
  attempts: number;
  registeredAt: number;
  startedAt?: number;
  finishedAt?: number;
  waiters: TaskWaiter[];
}

const PRIORITY_RANK: Record<BootTaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, ms));
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error(`启动任务超时（${timeoutMs}ms）`));
    }, timeoutMs);

    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function emptySnapshot(): BootSchedulerSnapshot {
  return {
    status: "idle",
    startedAt: null,
    finishedAt: null,
    tasks: [],
    completed: 0,
    total: 0,
  };
}

/**
 * 开屏期间的数据预取调度器。
 *
 * - 所有任务在 render 前启动，不阻塞开屏动画。
 * - 依赖任务完成后再启动下游任务；无依赖关系或依赖相同的任务并行。
 * - 结果会被缓存，React 组件通过 await/get 复用，不重复请求。
 * - 后续增加启动数据时只需 register 任务，并声明 dependsOn。
 */
export class BootScheduler {
  private readonly records = new Map<string, TaskRecord>();
  private readonly listeners = new Set<() => void>();
  private readonly maxConcurrency: number;
  private snapshot: BootSchedulerSnapshot = emptySnapshot();
  private started = false;
  private running = 0;
  private pumpScheduled = false;
  private sequence = 0;

  constructor(options: { maxConcurrency?: number } = {}) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency ?? 6);
  }

  register<T>(task: BootTask<T>): void {
    const id = task.id.trim();
    if (!id) {
      throw new Error("启动任务缺少 id");
    }
    if (this.records.has(id)) {
      throw new Error(`启动任务重复注册：${id}`);
    }

    this.records.set(id, {
      task: { ...task, id },
      status: "pending",
      attempts: 0,
      registeredAt: (this.sequence += 1),
      waiters: [],
    });
    this.publish();

    if (this.started) {
      if (this.snapshot.status === "done") {
        this.snapshot = {
          ...this.snapshot,
          status: "running",
          finishedAt: null,
        };
        this.publish();
      }
      this.schedulePump();
    }
  }

  has(taskId: string): boolean {
    return this.records.has(taskId);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.snapshot = {
      ...this.snapshot,
      status: "running",
      startedAt: Date.now(),
    };
    this.publish();
    this.schedulePump();
  }

  get<T = unknown>(taskId: string): T | undefined {
    const record = this.records.get(taskId);
    return record?.status === "success" ? (record.value as T) : undefined;
  }

  status(taskId: string): BootTaskStatus | undefined {
    return this.records.get(taskId)?.status;
  }

  /** 等待任务结束；跳过的任务返回 undefined，失败的任务抛错。 */
  async await<T = unknown>(taskId: string): Promise<T | undefined> {
    this.start();
    const record = this.records.get(taskId);
    if (!record) {
      throw new Error(`启动任务不存在：${taskId}`);
    }

    if (record.status === "success") return record.value as T;
    if (record.status === "skipped") return undefined;
    if (record.status === "error" || record.status === "blocked") {
      throw record.error ?? new Error(`启动任务未完成：${taskId}`);
    }

    return new Promise<T | undefined>((resolve, reject) => {
      record.waiters.push({
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): BootSchedulerSnapshot => this.snapshot;

  private readonly context: BootTaskContext = {
    get: <T = unknown>(taskId: string) => this.get<T>(taskId),
    status: (taskId: string) => this.status(taskId),
  };

  private schedulePump() {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }

  private pump() {
    if (!this.started) return;

    this.refreshBlocked();

    while (this.running < this.maxConcurrency) {
      const record = this.nextRunnable();
      if (!record) break;
      this.startTask(record);
    }

    if (this.running === 0) {
      const pending = [...this.records.values()].filter(
        (record) => record.status === "pending",
      );
      if (pending.length > 0) {
        for (const record of pending) {
          this.fail(
            record,
            new Error("启动任务依赖无法满足，可能存在循环依赖或缺失任务"),
          );
        }
        this.refreshBlocked();
      }

      if (this.allSettled()) {
        this.finish();
      }
    }
  }

  private nextRunnable(): TaskRecord | undefined {
    const candidates = [...this.records.values()]
      .filter((record) => record.status === "pending")
      .sort((left, right) => {
        const leftPriority = PRIORITY_RANK[left.task.priority ?? "normal"];
        const rightPriority = PRIORITY_RANK[right.task.priority ?? "normal"];
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return left.registeredAt - right.registeredAt;
      });

    for (const record of candidates) {
      if (!this.dependenciesSatisfied(record)) continue;
      if (!this.isEnabled(record)) continue;
      return record;
    }
    return undefined;
  }

  /**
   * 返回任务是否应该启动。enabled 为 false 时在这里直接标记跳过，
   * 避免调度循环误判为“没有可运行任务”。
   */
  private isEnabled(record: TaskRecord): boolean {
    let enabled = true;
    try {
      enabled = record.task.enabled?.(this.context) ?? true;
    } catch (error) {
      this.fail(record, error);
      return false;
    }

    if (!enabled) {
      this.skip(record);
      return false;
    }
    return true;
  }

  private dependenciesSatisfied(record: TaskRecord): boolean {
    for (const dependencyId of record.task.dependsOn ?? []) {
      const dependency = this.records.get(dependencyId);
      if (!dependency) return false;
      if (
        dependency.status !== "success" &&
        dependency.status !== "skipped"
      ) {
        return false;
      }
    }
    return true;
  }

  private refreshBlocked() {
    let changed = false;

    for (const record of this.records.values()) {
      if (record.status !== "pending") continue;

      const failedDependency = (record.task.dependsOn ?? []).find(
        (dependencyId) => {
          const dependency = this.records.get(dependencyId);
          return (
            !dependency ||
            dependency.status === "error" ||
            dependency.status === "blocked"
          );
        },
      );
      if (!failedDependency) continue;

      this.block(
        record,
        new Error(`启动任务依赖失败：${failedDependency}`),
      );
      changed = true;
    }

    if (changed) this.publish();
  }

  private startTask(record: TaskRecord) {
    record.status = "running";
    record.startedAt = Date.now();
    this.running += 1;
    this.publish();

    void this.runTask(record).finally(() => {
      record.finishedAt = Date.now();
      this.running -= 1;
      this.publish();
      this.schedulePump();
    });
  }

  private async runTask(record: TaskRecord) {
    const retries = Math.max(0, record.task.retries ?? 0);
    const maxAttempts = retries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      record.attempts = attempt;

      try {
        const value = await withTimeout(
          Promise.resolve(record.task.run(this.context)),
          record.task.timeoutMs,
        );
        this.succeed(record, value);
        return;
      } catch (error) {
        if (attempt < maxAttempts) {
          await delay(record.task.retryDelayMs ?? 250);
          continue;
        }
        this.fail(record, error);
      }
    }
  }

  private succeed(record: TaskRecord, value: unknown) {
    record.status = "success";
    record.value = value;
    record.error = undefined;
    this.settleWaiters(record, value);
  }

  private fail(record: TaskRecord, error: unknown) {
    record.status = "error";
    record.error = error;
    const waiters = record.waiters;
    record.waiters = [];
    for (const waiter of waiters) waiter.reject(error);
  }

  private skip(record: TaskRecord) {
    record.status = "skipped";
    record.value = undefined;
    this.settleWaiters(record, undefined);
  }

  private block(record: TaskRecord, error: unknown) {
    record.status = "blocked";
    record.error = error;
    const waiters = record.waiters;
    record.waiters = [];
    for (const waiter of waiters) waiter.reject(error);
  }

  private settleWaiters(record: TaskRecord, value: unknown) {
    const waiters = record.waiters;
    record.waiters = [];
    for (const waiter of waiters) waiter.resolve(value);
  }

  private allSettled(): boolean {
    return [...this.records.values()].every(
      (record) =>
        record.status === "success" ||
        record.status === "error" ||
        record.status === "skipped" ||
        record.status === "blocked",
    );
  }

  private finish() {
    if (this.snapshot.status === "done") return;
    this.snapshot = {
      ...this.snapshot,
      status: "done",
      finishedAt: Date.now(),
    };
    this.publish();
  }

  private publish() {
    const tasks = [...this.records.values()]
      .sort((left, right) => left.registeredAt - right.registeredAt)
      .map<BootTaskSnapshot>((record) => ({
        id: record.task.id,
        priority: record.task.priority ?? "normal",
        status: record.status,
        error: record.error ? errorMessage(record.error) : null,
        attempts: record.attempts,
      }));

    const completed = tasks.filter(
      (task) =>
        task.status === "success" ||
        task.status === "error" ||
        task.status === "skipped" ||
        task.status === "blocked",
    ).length;

    this.snapshot = {
      ...this.snapshot,
      tasks,
      completed,
      total: tasks.length,
    };

    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // 单个订阅者失败不影响调度
      }
    }
  }
}

export function createBootScheduler(options?: {
  maxConcurrency?: number;
}): BootScheduler {
  return new BootScheduler(options);
}

export const bootScheduler = createBootScheduler();

export function useBootScheduler(): BootSchedulerSnapshot {
  return useSyncExternalStore(
    bootScheduler.subscribe,
    bootScheduler.getSnapshot,
    bootScheduler.getSnapshot,
  );
}

export function useBootTask<T = unknown>(taskId: string): {
  status: BootTaskStatus | undefined;
  value: T | undefined;
  error: string | null;
  task: BootTaskSnapshot | undefined;
} {
  const snapshot = useBootScheduler();
  const task = snapshot.tasks.find((item) => item.id === taskId);
  return {
    status: task?.status,
    value: bootScheduler.get<T>(taskId),
    error: task?.error ?? null,
    task,
  };
}
