import { getAutomationContext } from "../automation/context.js";

export interface RealtimeEventMeta {
  automationRunId?: string;
  automationDepth?: number;
  correlationId?: string;
}

export interface RealtimeUserEvent {
  userId: string;
  module: string;
  event: string;
  payload: unknown;
  meta?: RealtimeEventMeta;
}

type RealtimeEventListener = (event: RealtimeUserEvent) => void;

const listeners = new Set<RealtimeEventListener>();

export function publishRealtimeEvent(event: RealtimeUserEvent) {
  const context = getAutomationContext();
  const enriched: RealtimeUserEvent = context
    ? {
        ...event,
        meta: {
          ...event.meta,
          automationRunId: context.runId,
          automationDepth: context.depth,
          correlationId: context.correlationId,
        },
      }
    : event;

  for (const listener of listeners) {
    try {
      listener(enriched);
    } catch {
      // 单个订阅者失败不能影响领域操作
    }
  }
}

export function onRealtimeEvent(
  listener: RealtimeEventListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
