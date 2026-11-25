export const REALTIME_PROTOCOL_VERSION = 1 as const;

export type RealtimeProtocolVersion = typeof REALTIME_PROTOCOL_VERSION;

export interface RealtimeErrorPayload {
  code: string;
  message: string;
}

export interface RealtimeMeta {
  traceId?: string;
  ts?: number;
}

export type RealtimeEnvelopeType =
  | "request"
  | "response"
  | "event"
  | "subscribe"
  | "unsubscribe";

export interface RealtimeEnvelope<T = unknown> {
  v: RealtimeProtocolVersion;
  type: RealtimeEnvelopeType;
  id?: string;
  module?: string;
  action?: string;
  event?: string;
  payload?: T;
  ok?: boolean;
  error?: RealtimeErrorPayload;
  seq?: number;
  meta?: RealtimeMeta;
}

export interface RealtimeRequestEnvelope<T = unknown>
  extends RealtimeEnvelope<T> {
  type: "request";
  id: string;
  module: string;
  action: string;
  payload: T;
}

export interface RealtimeResponseEnvelope<T = unknown>
  extends RealtimeEnvelope<T> {
  type: "response";
  id: string;
  ok: boolean;
  payload?: T;
  error?: RealtimeErrorPayload;
}

export interface RealtimeEventEnvelope<T = unknown>
  extends RealtimeEnvelope<T> {
  type: "event";
  module: string;
  event: string;
  payload: T;
  seq?: number;
}

export type RealtimeConnectionStatus =
  | "closed"
  | "connecting"
  | "open"
  | "reconnecting";

export const REALTIME_CLOSE_CODES = {
  unauthorized: 4401,
  forbidden: 4403,
  protocol: 4400,
  serverShutdown: 1012,
} as const;
