export interface RealtimeUserEvent {
  userId: string;
  module: string;
  event: string;
  payload: unknown;
}

type RealtimeEventListener = (event: RealtimeUserEvent) => void;

const listeners = new Set<RealtimeEventListener>();

export function publishRealtimeEvent(event: RealtimeUserEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
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
