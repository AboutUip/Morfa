import { randomUUID } from "node:crypto";

import {
  cancelQueuedRunsForSignal,
  cancelQueuedRunsForTrigger,
  claimRun,
  countCustomSignals,
  countTriggers,
  disableTriggersForSignal,
  findCustomSignal,
  findEventById,
  findLatestRunForTrigger,
  findRunForUser,
  findTriggerForUser,
  finishRun,
  finishRunStep,
  insertCustomSignal,
  insertEvent,
  insertRun,
  insertRunStep,
  insertTrigger,
  isRunCancelRequested,
  listActiveTriggersForSignal,
  listCustomSignals,
  listQueuedRuns,
  listRunSteps,
  listRunsForUser,
  listTriggersForUser,
  requestCancelRun,
  setTriggerEnabled,
  softDeleteCustomSignal,
  softDeleteTrigger,
  touchTriggerRun,
  updateCustomSignal,
  updateTrigger,
  type CustomSignalRow,
  type RunRow,
  type TriggerRow,
} from "../db/automation.js";
import { transaction } from "../db/transaction.js";
import type { UserRow } from "../db/users.js";
import { ApiError } from "../lib/errors.js";
import {
  onRealtimeEvent,
  type RealtimeUserEvent,
} from "../realtime/events.js";
import {
  getActionDefinition,
  listActionDefinitions,
  validateActionList,
} from "./actions.js";
import {
  evaluateCondition,
  validateCondition,
  type AutomationCondition,
} from "./conditions.js";
import { runWithAutomationContext } from "./context.js";
import {
  BUILT_IN_SIGNAL_MAP,
  BUILT_IN_SIGNALS,
  REALTIME_SIGNAL_MAP,
  type LocalizedText,
} from "./signals.js";
import type {
  AutomationActionCatalogItem,
  AutomationActionDto,
  AutomationRunDto,
  AutomationRunSummaryDto,
  AutomationSignalDto,
  AutomationTriggerDto,
} from "./types.js";

const MAX_CUSTOM_SIGNALS = 30;
const MAX_TRIGGERS = 50;
const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_DEPTH = 8;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CUSTOM_SIGNAL_KEY = /^custom\.[a-z0-9][a-z0-9_.-]{0,48}$/;

type SignalSource = "system" | "code" | "trigger" | "test";

interface EmitSignalInput {
  userId: string;
  signalKey: string;
  payload: Record<string, unknown>;
  source: SignalSource;
  sourceRunId?: string | null;
  correlationId?: string | null;
  depth?: number;
  idempotencyKey?: string | null;
}

interface EmitSignalResult {
  duplicate: boolean;
  eventId: string | null;
  queuedRunIds: string[];
  skippedRunIds: string[];
}

function toLocalized(value: string): LocalizedText {
  return { "zh-CN": value, "en-US": value };
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseActions(value: string): AutomationActionDto[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is AutomationActionDto =>
        Boolean(entry) &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof (entry as { type?: unknown }).type === "string",
    );
  } catch {
    return [];
  }
}

function toRunSummary(run: RunRow): AutomationRunSummaryDto {
  return {
    id: run.id,
    triggerId: run.trigger_id,
    triggerName: run.trigger_name,
    signalKey: run.signal_key,
    status: run.status,
    errorCode: run.error_code,
    errorMessage: run.error_message,
    createdAt: run.created_at,
    finishedAt: run.finished_at,
  };
}

function toTriggerDto(
  trigger: TriggerRow,
  lastRun: RunRow | undefined,
): AutomationTriggerDto {
  let condition: AutomationCondition = { all: [] };
  try {
    condition = validateCondition(JSON.parse(trigger.condition_json));
  } catch {
    condition = { all: [] };
  }

  return {
    id: trigger.id,
    name: trigger.name,
    signalKey: trigger.signal_key,
    enabled: trigger.enabled === 1,
    condition,
    actions: parseActions(trigger.actions_json),
    cooldownMs: trigger.cooldown_ms,
    lastRunAt: trigger.last_run_at,
    lastRun: lastRun ? toRunSummary(lastRun) : null,
    createdAt: trigger.created_at,
    updatedAt: trigger.updated_at,
  };
}

function toCustomSignalDto(
  signal: CustomSignalRow,
  triggerCount: number,
): AutomationSignalDto {
  return {
    key: signal.signal_key,
    title: toLocalized(signal.name),
    description: toLocalized(signal.description),
    category: "custom",
    builtIn: false,
    payloadExample: {},
    triggerCount,
    createdAt: signal.created_at,
  };
}

function validateName(value: string): string {
  const name = value.trim();
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new ApiError(
      400,
      "AUTOMATION_NAME_INVALID",
      "名称长度需为 1–80 个字符",
    );
  }
  return name;
}

function validateDescription(value: string): string {
  const description = value.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ApiError(
      400,
      "AUTOMATION_DESCRIPTION_INVALID",
      "描述不能超过 500 个字符",
    );
  }
  return description;
}

function normalizeCustomSignalKey(value: string): string {
  const raw = value.trim().toLowerCase();
  const key = raw.startsWith("custom.") ? raw : `custom.${raw}`;
  if (!CUSTOM_SIGNAL_KEY.test(key) || key.includes("..")) {
    throw new ApiError(
      400,
      "AUTOMATION_SIGNAL_KEY_INVALID",
      "自定义信号 key 格式不正确",
    );
  }
  return key;
}

function ensureSignalAvailable(
  userId: string,
  signalKey: string,
): { builtIn: boolean; custom?: CustomSignalRow } {
  if (BUILT_IN_SIGNAL_MAP.has(signalKey)) {
    return { builtIn: true };
  }

  const custom = findCustomSignal(userId, signalKey);
  if (!custom) {
    throw new ApiError(
      404,
      "AUTOMATION_SIGNAL_NOT_FOUND",
      "信号不存在",
    );
  }
  return { builtIn: false, custom };
}

function validateCooldown(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_COOLDOWN_MS
  ) {
    throw new ApiError(
      400,
      "AUTOMATION_COOLDOWN_INVALID",
      "冷却时间不正确",
    );
  }
  return Math.round(value);
}

function parseRunDto(run: RunRow): AutomationRunDto {
  return {
    ...toRunSummary(run),
    payload: parseJsonObject(run.payload_json),
    steps: listRunSteps(run.id).map((step) => ({
      id: step.id,
      stepIndex: step.step_index,
      actionType: step.action_type,
      status: step.status,
      input: parseJsonObject(step.input_json),
      output: step.output_json
        ? parseJsonObject(step.output_json)
        : null,
      errorCode: step.error_code,
      errorMessage: step.error_message,
      startedAt: step.started_at,
      finishedAt: step.finished_at,
    })),
    startedAt: run.started_at,
    cancelRequestedAt: run.cancel_requested_at,
  };
}

export class AutomationEngine {
  private stopListener: (() => void) | null = null;
  private processing = false;
  private stopped = false;

  start() {
    if (this.stopListener) return;
    this.stopped = false;
    this.stopListener = onRealtimeEvent((event) => {
      void this.handleRealtimeEvent(event);
    });
    this.wake();
  }

  stop() {
    this.stopped = true;
    this.stopListener?.();
    this.stopListener = null;
  }

  listSignals(userId: string): AutomationSignalDto[] {
    const triggers = listTriggersForUser(userId);
    const counts = new Map<string, number>();
    for (const trigger of triggers) {
      counts.set(
        trigger.signal_key,
        (counts.get(trigger.signal_key) ?? 0) + 1,
      );
    }

    const builtIns: AutomationSignalDto[] = BUILT_IN_SIGNALS.map(
      (signal) => ({
        key: signal.key,
        title: signal.title,
        description: signal.description,
        category: signal.category,
        builtIn: true,
        payloadExample: signal.payloadExample,
        triggerCount: counts.get(signal.key) ?? 0,
        createdAt: null,
      }),
    );

    const custom = listCustomSignals(userId).map((signal) =>
      toCustomSignalDto(signal, counts.get(signal.signal_key) ?? 0),
    );

    return [...builtIns, ...custom];
  }

  listActions(userId: string): AutomationActionCatalogItem[] {
    return listActionDefinitions(userId).map((action) => ({
      type: action.type,
      title: action.title,
      description: action.description,
      fields: action.fields,
    }));
  }

  createCustomSignal(
    user: UserRow,
    input: { key: string; name: string; description: string },
  ): AutomationSignalDto {
    if (countCustomSignals(user.id) >= MAX_CUSTOM_SIGNALS) {
      throw new ApiError(
        409,
        "AUTOMATION_SIGNAL_LIMIT",
        "自定义信号数量已达上限",
      );
    }

    const signalKey = normalizeCustomSignalKey(input.key);
    if (findCustomSignal(user.id, signalKey)) {
      throw new ApiError(
        409,
        "AUTOMATION_SIGNAL_EXISTS",
        "该信号已存在",
      );
    }

    const name = validateName(input.name);
    const description = validateDescription(input.description);
    const now = Date.now();

    insertCustomSignal({
      id: randomUUID(),
      userId: user.id,
      signalKey,
      name,
      description,
      now,
    });

    const created = findCustomSignal(user.id, signalKey);
    if (!created) {
      throw new ApiError(
        500,
        "AUTOMATION_SIGNAL_CREATE_FAILED",
        "自定义信号创建失败",
      );
    }

    return toCustomSignalDto(created, 0);
  }

  updateCustomSignal(
    user: UserRow,
    signalKeyInput: string,
    input: { name: string; description: string },
  ): AutomationSignalDto {
    const signalKey = normalizeCustomSignalKey(signalKeyInput);
    const existing = findCustomSignal(user.id, signalKey);
    if (!existing) {
      throw new ApiError(
        404,
        "AUTOMATION_SIGNAL_NOT_FOUND",
        "信号不存在",
      );
    }

    const name = validateName(input.name);
    const description = validateDescription(input.description);
    const now = Date.now();

    if (
      !updateCustomSignal({
        userId: user.id,
        signalKey,
        name,
        description,
        now,
      })
    ) {
      throw new ApiError(
        404,
        "AUTOMATION_SIGNAL_NOT_FOUND",
        "信号不存在",
      );
    }

    const updated = findCustomSignal(user.id, signalKey);
    if (!updated) {
      throw new ApiError(
        404,
        "AUTOMATION_SIGNAL_NOT_FOUND",
        "信号不存在",
      );
    }

    const count = listTriggersForUser(user.id).filter(
      (trigger) => trigger.signal_key === signalKey,
    ).length;
    return toCustomSignalDto(updated, count);
  }

  deleteCustomSignal(user: UserRow, signalKeyInput: string) {
    const signalKey = normalizeCustomSignalKey(signalKeyInput);
    const now = Date.now();

    transaction(() => {
      if (!softDeleteCustomSignal(user.id, signalKey, now)) {
        throw new ApiError(
          404,
          "AUTOMATION_SIGNAL_NOT_FOUND",
          "信号不存在",
        );
      }
      disableTriggersForSignal(user.id, signalKey, now);
      cancelQueuedRunsForSignal(user.id, signalKey, now);
    });
  }

  listTriggers(userId: string): AutomationTriggerDto[] {
    return listTriggersForUser(userId).map((trigger) =>
      toTriggerDto(
        trigger,
        findLatestRunForTrigger(userId, trigger.id),
      ),
    );
  }

  createTrigger(
    user: UserRow,
    input: {
      name: string;
      signalKey: string;
      enabled: boolean;
      condition: unknown;
      actions: unknown;
      cooldownMs: unknown;
    },
  ): AutomationTriggerDto {
    if (countTriggers(user.id) >= MAX_TRIGGERS) {
      throw new ApiError(
        409,
        "AUTOMATION_TRIGGER_LIMIT",
        "触发器数量已达上限",
      );
    }

    const name = validateName(input.name);
    const signalKey = input.signalKey.trim();
    if (!signalKey) {
      throw new ApiError(
        400,
        "AUTOMATION_SIGNAL_REQUIRED",
        "请选择信号",
      );
    }
    ensureSignalAvailable(user.id, signalKey);

    const condition = validateCondition(input.condition);
    const actions = validateActionList(user.id, input.actions);
    const cooldownMs = validateCooldown(input.cooldownMs);
    const now = Date.now();
    const id = randomUUID();

    insertTrigger({
      id,
      userId: user.id,
      name,
      signalKey,
      enabled: input.enabled,
      conditionJson: JSON.stringify(condition),
      actionsJson: JSON.stringify(actions),
      cooldownMs,
      now,
    });

    const created = findTriggerForUser(user.id, id);
    if (!created) {
      throw new ApiError(
        500,
        "AUTOMATION_TRIGGER_CREATE_FAILED",
        "触发器创建失败",
      );
    }

    return toTriggerDto(created, undefined);
  }

  updateTrigger(
    user: UserRow,
    triggerId: string,
    input: {
      name: string;
      signalKey: string;
      enabled: boolean;
      condition: unknown;
      actions: unknown;
      cooldownMs: unknown;
    },
  ): AutomationTriggerDto {
    const existing = findTriggerForUser(user.id, triggerId);
    if (!existing) {
      throw new ApiError(
        404,
        "AUTOMATION_TRIGGER_NOT_FOUND",
        "触发器不存在",
      );
    }

    const name = validateName(input.name);
    const signalKey = input.signalKey.trim();
    ensureSignalAvailable(user.id, signalKey);
    const condition = validateCondition(input.condition);
    const actions = validateActionList(user.id, input.actions);
    const cooldownMs = validateCooldown(input.cooldownMs);
    const now = Date.now();

    if (
      !updateTrigger({
        userId: user.id,
        id: triggerId,
        name,
        signalKey,
        enabled: input.enabled,
        conditionJson: JSON.stringify(condition),
        actionsJson: JSON.stringify(actions),
        cooldownMs,
        now,
      })
    ) {
      throw new ApiError(
        404,
        "AUTOMATION_TRIGGER_NOT_FOUND",
        "触发器不存在",
      );
    }

    const updated = findTriggerForUser(user.id, triggerId);
    if (!updated) {
      throw new ApiError(
        404,
        "AUTOMATION_TRIGGER_NOT_FOUND",
        "触发器不存在",
      );
    }

    return toTriggerDto(
      updated,
      findLatestRunForTrigger(user.id, triggerId),
    );
  }

  setTriggerEnabled(
    user: UserRow,
    triggerId: string,
    enabled: boolean,
  ): AutomationTriggerDto {
    if (!setTriggerEnabled(user.id, triggerId, enabled, Date.now())) {
      throw new ApiError(
        404,
        "AUTOMATION_TRIGGER_NOT_FOUND",
        "触发器不存在",
      );
    }

    const trigger = findTriggerForUser(user.id, triggerId);
    if (!trigger) {
      throw new ApiError(
        404,
        "AUTOMATION_TRIGGER_NOT_FOUND",
        "触发器不存在",
      );
    }

    return toTriggerDto(
      trigger,
      findLatestRunForTrigger(user.id, triggerId),
    );
  }

  deleteTrigger(user: UserRow, triggerId: string) {
    const now = Date.now();
    transaction(() => {
      if (!softDeleteTrigger(user.id, triggerId, now)) {
        throw new ApiError(
          404,
          "AUTOMATION_TRIGGER_NOT_FOUND",
          "触发器不存在",
        );
      }
      cancelQueuedRunsForTrigger(user.id, triggerId, now);
    });
  }

  async emitSignal(input: EmitSignalInput): Promise<EmitSignalResult> {
    const depth = input.depth ?? 0;
    if (depth > MAX_DEPTH) {
      throw new ApiError(
        400,
        "AUTOMATION_RECURSION_LIMIT",
        "信号触发链路过深，已停止执行",
      );
    }

    const signalKey = input.signalKey.trim();
    ensureSignalAvailable(input.userId, signalKey);

    const payloadJson = JSON.stringify(input.payload ?? {});
    if (Buffer.byteLength(payloadJson, "utf8") > MAX_PAYLOAD_BYTES) {
      throw new ApiError(
        413,
        "AUTOMATION_PAYLOAD_TOO_LARGE",
        "信号 payload 过大",
      );
    }

    const eventId = randomUUID();
    const now = Date.now();
    const sourceRun = input.sourceRunId
      ? findRunForUser(input.userId, input.sourceRunId)
      : undefined;
    const queuedRunIds: string[] = [];
    const skippedRunIds: string[] = [];

    const inserted = transaction(() => {
      if (
        !insertEvent({
          id: eventId,
          userId: input.userId,
          signalKey,
          payloadJson,
          source: input.source,
          sourceRunId: input.sourceRunId ?? null,
          correlationId: input.correlationId ?? null,
          depth,
          idempotencyKey: input.idempotencyKey ?? null,
          now,
        })
      ) {
        return false;
      }

      const triggers = listActiveTriggersForSignal(input.userId, signalKey);
      for (const trigger of triggers) {
        if (sourceRun && trigger.id === sourceRun.trigger_id) {
          continue;
        }

        const condition = validateCondition(
          parseJsonObject(trigger.condition_json),
        );
        const matched = evaluateCondition(condition, {
          signal: signalKey,
          source: input.source,
          depth,
          payload: input.payload,
        });
        if (!matched) continue;

        if (
          trigger.cooldown_ms > 0 &&
          trigger.last_run_at &&
          now - trigger.last_run_at < trigger.cooldown_ms
        ) {
          const skippedId = randomUUID();
          const insertedSkipped = insertRun({
            id: skippedId,
            userId: input.userId,
            triggerId: trigger.id,
            triggerName: trigger.name,
            eventId,
            signalKey,
            status: "skipped",
            payloadJson,
            errorCode: "AUTOMATION_COOLDOWN",
            errorMessage: "触发器处于冷却期",
            depth,
            now,
          });
          if (insertedSkipped) skippedRunIds.push(skippedId);
          continue;
        }

        const runId = randomUUID();
        const insertedRun = insertRun({
          id: runId,
          userId: input.userId,
          triggerId: trigger.id,
          triggerName: trigger.name,
          eventId,
          signalKey,
          status: "queued",
          payloadJson,
          errorCode: null,
          errorMessage: null,
          depth,
          now,
        });

        if (insertedRun) {
          queuedRunIds.push(runId);
          touchTriggerRun(trigger.id, now);
        }
      }

      return true;
    });

    if (!inserted) {
      return {
        duplicate: true,
        eventId: null,
        queuedRunIds: [],
        skippedRunIds: [],
      };
    }

    if (queuedRunIds.length > 0) this.wake();

    return {
      duplicate: false,
      eventId,
      queuedRunIds,
      skippedRunIds,
    };
  }

  async testTrigger(
    user: UserRow,
    triggerId: string,
    payload: Record<string, unknown>,
  ): Promise<AutomationRunDto> {
    const trigger = findTriggerForUser(user.id, triggerId);
    if (!trigger) {
      throw new ApiError(
        404,
        "AUTOMATION_TRIGGER_NOT_FOUND",
        "触发器不存在",
      );
    }

    const payloadJson = JSON.stringify(payload ?? {});
    if (Buffer.byteLength(payloadJson, "utf8") > MAX_PAYLOAD_BYTES) {
      throw new ApiError(
        413,
        "AUTOMATION_PAYLOAD_TOO_LARGE",
        "测试 payload 过大",
      );
    }

    const eventId = randomUUID();
    const runId = randomUUID();
    const now = Date.now();
    const condition = validateCondition(
      parseJsonObject(trigger.condition_json),
    );
    const matched = evaluateCondition(condition, {
      signal: trigger.signal_key,
      source: "test",
      depth: 0,
      payload,
    });

    transaction(() => {
      if (
        !insertEvent({
          id: eventId,
          userId: user.id,
          signalKey: trigger.signal_key,
          payloadJson,
          source: "test",
          sourceRunId: null,
          correlationId: null,
          depth: 0,
          idempotencyKey: null,
          now,
        })
      ) {
        throw new ApiError(
          409,
          "AUTOMATION_EVENT_DUPLICATE",
          "测试事件重复",
        );
      }

      if (
        !insertRun({
          id: runId,
          userId: user.id,
          triggerId: trigger.id,
          triggerName: trigger.name,
          eventId,
          signalKey: trigger.signal_key,
          status: matched ? "queued" : "skipped",
          payloadJson,
          errorCode: matched
            ? null
            : "AUTOMATION_CONDITION_NOT_MATCHED",
          errorMessage: matched ? null : "条件不匹配",
          depth: 0,
          now,
        })
      ) {
        throw new ApiError(
          409,
          "AUTOMATION_RUN_DUPLICATE",
          "测试运行重复",
        );
      }

      touchTriggerRun(trigger.id, now);
    });

    const run = findRunForUser(user.id, runId);
    if (!run) {
      throw new ApiError(
        500,
        "AUTOMATION_RUN_NOT_FOUND",
        "测试运行创建失败",
      );
    }

    if (run.status === "queued") this.wake();
    return parseRunDto(run);
  }

  listRuns(userId: string, limit = 30): AutomationRunSummaryDto[] {
    return listRunsForUser(userId, limit).map(toRunSummary);
  }

  getRun(userId: string, runId: string): AutomationRunDto {
    const run = findRunForUser(userId, runId);
    if (!run) {
      throw new ApiError(
        404,
        "AUTOMATION_RUN_NOT_FOUND",
        "运行记录不存在",
      );
    }
    return parseRunDto(run);
  }

  cancelRun(userId: string, runId: string): AutomationRunSummaryDto {
    const run = requestCancelRun(userId, runId, Date.now());
    if (!run) {
      throw new ApiError(
        404,
        "AUTOMATION_RUN_NOT_FOUND",
        "运行记录不存在",
      );
    }
    return toRunSummary(run);
  }

  retryRun(user: UserRow, runId: string): AutomationRunDto {
    const run = findRunForUser(user.id, runId);
    if (!run) {
      throw new ApiError(
        404,
        "AUTOMATION_RUN_NOT_FOUND",
        "运行记录不存在",
      );
    }

    const trigger = findTriggerForUser(user.id, run.trigger_id);
    if (!trigger) {
      throw new ApiError(
        404,
        "AUTOMATION_TRIGGER_NOT_FOUND",
        "触发器已删除，无法重试",
      );
    }

    const payload = parseJsonObject(run.payload_json);
    const eventId = randomUUID();
    const newRunId = randomUUID();
    const now = Date.now();
    const condition = validateCondition(
      parseJsonObject(trigger.condition_json),
    );
    const matched = evaluateCondition(condition, {
      signal: trigger.signal_key,
      source: "test",
      depth: 0,
      payload,
    });

    transaction(() => {
      insertEvent({
        id: eventId,
        userId: user.id,
        signalKey: trigger.signal_key,
        payloadJson: JSON.stringify(payload),
        source: "test",
        sourceRunId: run.id,
        correlationId: run.id,
        depth: 0,
        idempotencyKey: null,
        now,
      });

      insertRun({
        id: newRunId,
        userId: user.id,
        triggerId: trigger.id,
        triggerName: trigger.name,
        eventId,
        signalKey: trigger.signal_key,
        status: matched ? "queued" : "skipped",
        payloadJson: JSON.stringify(payload),
        errorCode: matched
          ? null
          : "AUTOMATION_CONDITION_NOT_MATCHED",
        errorMessage: matched ? null : "条件不匹配",
        depth: 0,
        now,
      });
    });

    const created = findRunForUser(user.id, newRunId);
    if (!created) {
      throw new ApiError(
        500,
        "AUTOMATION_RUN_NOT_FOUND",
        "重试运行创建失败",
      );
    }

    if (created.status === "queued") this.wake();
    return parseRunDto(created);
  }

  private handleRealtimeEvent(event: RealtimeUserEvent) {
    const signalKey = REALTIME_SIGNAL_MAP.get(
      `${event.module}.${event.event}`,
    );
    if (!signalKey) return;

    const depth = (event.meta?.automationDepth ?? 0) + 1;
    if (depth > MAX_DEPTH) return;

    void this.emitSignal({
      userId: event.userId,
      signalKey,
      payload:
        event.payload &&
        typeof event.payload === "object" &&
        !Array.isArray(event.payload)
          ? (event.payload as Record<string, unknown>)
          : { value: event.payload },
      source: "system",
      sourceRunId: event.meta?.automationRunId ?? null,
      correlationId:
        event.meta?.correlationId ?? `realtime_${event.module}_${event.event}`,
      depth,
    }).catch(() => {
      // 内置领域事件不能阻塞原业务流程
    });
  }

  private wake() {
    if (this.processing || this.stopped) return;
    this.processing = true;
    setImmediate(() => {
      void this.drain();
    });
  }

  private async drain() {
    try {
      while (!this.stopped) {
        const queued = listQueuedRuns(1);
        if (queued.length === 0) break;

        const run = queued[0];
        if (!claimRun(run.id, Date.now())) continue;

        const claimed = findRunForUser(run.user_id, run.id);
        if (!claimed) continue;
        try {
          await this.executeRun(claimed);
        } catch (error) {
          finishRun({
            runId: claimed.id,
            status: "failed",
            errorCode: "AUTOMATION_RUN_FAILED",
            errorMessage:
              error instanceof Error ? error.message : "自动化运行失败",
            now: Date.now(),
          });
        }
      }
    } finally {
      this.processing = false;
      if (!this.stopped && listQueuedRuns(1).length > 0) this.wake();
    }
  }

  private async executeRun(run: RunRow) {
    const event = findEventById(run.event_id);
    const context = {
      runId: run.id,
      eventId: run.event_id,
      depth: run.depth + 1,
      correlationId: event?.correlation_id ?? run.id,
    };
    const trigger = findTriggerForUser(run.user_id, run.trigger_id);
    if (!trigger) {
      finishRun({
        runId: run.id,
        status: "failed",
        errorCode: "AUTOMATION_TRIGGER_NOT_FOUND",
        errorMessage: "触发器已删除",
        now: Date.now(),
      });
      return;
    }
    const actions = parseActions(trigger.actions_json);
    if (actions.length === 0) {
      finishRun({
        runId: run.id,
        status: "failed",
        errorCode: "AUTOMATION_ACTIONS_INVALID",
        errorMessage: "触发器没有可执行的动作",
        now: Date.now(),
      });
      return;
    }

    if (isRunCancelRequested(run.id)) {
      finishRun({
        runId: run.id,
        status: "cancelled",
        errorCode: "AUTOMATION_CANCELLED",
        errorMessage: "运行已取消",
        now: Date.now(),
      });
      return;
    }

    let failed = false;
    let cancelled = false;

    await runWithAutomationContext(context, async () => {
      for (let index = 0; index < actions.length; index += 1) {
        if (isRunCancelRequested(run.id)) {
          cancelled = true;
          finishRun({
            runId: run.id,
            status: "cancelled",
            errorCode: "AUTOMATION_CANCELLED",
            errorMessage: "运行已取消",
            now: Date.now(),
          });
          return;
        }

        const action = actions[index];
        const definition = getActionDefinition(action.type);
        const stepId = randomUUID();
        const stepStarted = Date.now();

        if (!definition) {
          insertRunStep({
            id: stepId,
            runId: run.id,
            stepIndex: index,
            actionType: action.type,
            inputJson: JSON.stringify(action.config),
            now: stepStarted,
          });
          finishRunStep({
            id: stepId,
            status: "failed",
            outputJson: null,
            errorCode: "AUTOMATION_ACTION_NOT_FOUND",
            errorMessage: "动作不存在",
            now: Date.now(),
          });
          failed = true;
          break;
        }

        insertRunStep({
          id: stepId,
          runId: run.id,
          stepIndex: index,
          actionType: action.type,
          inputJson: JSON.stringify(action.config),
          now: stepStarted,
        });

        try {
          const output = await definition.execute(
            {
              userId: run.user_id,
              runId: run.id,
              eventId: run.event_id,
              depth: run.depth + 1,
              correlationId: context.correlationId,
              emitSignal: async (signalKey, signalPayload) => {
                await this.emitSignal({
                  userId: run.user_id,
                  signalKey,
                  payload: signalPayload,
                  source: "trigger",
                  sourceRunId: run.id,
                  correlationId: context.correlationId,
                  depth: run.depth + 1,
                });
              },
            },
            action.config,
          );

          finishRunStep({
            id: stepId,
            status: "success",
            outputJson: JSON.stringify(output),
            errorCode: null,
            errorMessage: null,
            now: Date.now(),
          });
        } catch (error) {
          const code =
            error instanceof ApiError
              ? error.code
              : "AUTOMATION_ACTION_FAILED";
          const message =
            error instanceof Error
              ? error.message
              : "动作执行失败";

          finishRunStep({
            id: stepId,
            status: "failed",
            outputJson: null,
            errorCode: code,
            errorMessage: message,
            now: Date.now(),
          });
          failed = true;
          break;
        }
      }
    });

    if (cancelled) return;

    finishRun({
      runId: run.id,
      status: failed ? "failed" : "success",
      errorCode: failed ? "AUTOMATION_ACTION_FAILED" : null,
      errorMessage: failed ? "动作执行失败" : null,
      now: Date.now(),
    });
  }
}

export const automationEngine = new AutomationEngine();
