import { AsyncLocalStorage } from "node:async_hooks";

export interface AutomationExecutionContext {
  runId: string;
  eventId: string;
  depth: number;
  correlationId: string;
}

const storage = new AsyncLocalStorage<AutomationExecutionContext>();

export function runWithAutomationContext<T>(
  context: AutomationExecutionContext,
  callback: () => T,
): T {
  return storage.run(context, callback);
}

export function getAutomationContext():
  | AutomationExecutionContext
  | undefined {
  return storage.getStore();
}
