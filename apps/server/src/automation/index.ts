import type { UserRow } from "../db/users.js";
import {
  registerAutomationAction,
  type AutomationActionDefinition,
} from "./actions.js";
import { automationEngine } from "./engine.js";

export function initializeAutomation() {
  automationEngine.start();
}

export function stopAutomation() {
  automationEngine.stop();
}

export interface EmitAutomationSignalOptions {
  sourceRunId?: string | null;
  correlationId?: string | null;
  depth?: number;
  idempotencyKey?: string | null;
}

export interface DefineAutomationTriggerInput {
  name: string;
  signalKey: string;
  enabled: boolean;
  condition: unknown;
  actions: unknown;
  cooldownMs: unknown;
}

/**
 * 服务端代码专用入口。这里不暴露 HTTP 或 MCP 接口，触发器、信号和动作
 * 只能由 Morfa 自身的服务端代码注册、修改和触发。
 *
 * 示例：
 * automation.registerAction({
 *   type: "feature.doSomething",
 *   title: { "zh-CN": "执行操作", "en-US": "Do something" },
 *   description: { "zh-CN": "代码动作", "en-US": "Code action" },
 *   fields: [],
 *   validate: (_userId, config) => config,
 *   execute: async (context, config) => ({ ...config }),
 * });
 * await automation.emit(user.id, "custom.feature_finished", { id });
 */
export const automation = {
  emit(
    userId: string,
    signalKey: string,
    payload: Record<string, unknown> = {},
    options: EmitAutomationSignalOptions = {},
  ) {
    return automationEngine.emitSignal({
      userId,
      signalKey,
      payload,
      source: "code",
      sourceRunId: options.sourceRunId ?? null,
      correlationId: options.correlationId ?? null,
      depth: options.depth ?? 0,
      idempotencyKey: options.idempotencyKey ?? null,
    });
  },

  registerAction(definition: AutomationActionDefinition) {
    return registerAutomationAction(definition);
  },

  defineSignal(
    user: UserRow,
    input: { key: string; name: string; description: string },
  ) {
    return automationEngine.createCustomSignal(user, input);
  },

  removeSignal(user: UserRow, signalKey: string) {
    automationEngine.deleteCustomSignal(user, signalKey);
  },

  listSignals(userId: string) {
    return automationEngine.listSignals(userId);
  },

  listActions(userId: string) {
    return automationEngine.listActions(userId);
  },

  defineTrigger(user: UserRow, input: DefineAutomationTriggerInput) {
    return automationEngine.createTrigger(user, input);
  },

  listTriggers(userId: string) {
    return automationEngine.listTriggers(userId);
  },

  updateTrigger(
    user: UserRow,
    triggerId: string,
    input: DefineAutomationTriggerInput,
  ) {
    return automationEngine.updateTrigger(user, triggerId, input);
  },

  setTriggerEnabled(user: UserRow, triggerId: string, enabled: boolean) {
    return automationEngine.setTriggerEnabled(user, triggerId, enabled);
  },

  removeTrigger(user: UserRow, triggerId: string) {
    automationEngine.deleteTrigger(user, triggerId);
  },

  testTrigger(
    user: UserRow,
    triggerId: string,
    payload: Record<string, unknown> = {},
  ) {
    return automationEngine.testTrigger(user, triggerId, payload);
  },

  listRuns(userId: string, limit = 30) {
    return automationEngine.listRuns(userId, limit);
  },

  getRun(userId: string, runId: string) {
    return automationEngine.getRun(userId, runId);
  },

  cancelRun(userId: string, runId: string) {
    return automationEngine.cancelRun(userId, runId);
  },

  retryRun(user: UserRow, runId: string) {
    return automationEngine.retryRun(user, runId);
  },
};

export { registerAutomationAction } from "./actions.js";
export type { AutomationActionDefinition } from "./actions.js";
export type {
  AutomationActionCatalogItem,
  AutomationRunDto,
  AutomationRunSummaryDto,
  AutomationSignalDto,
  AutomationTriggerDto,
} from "./types.js";
