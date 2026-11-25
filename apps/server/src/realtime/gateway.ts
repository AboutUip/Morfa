import {
  REALTIME_CLOSE_CODES,
  REALTIME_PROTOCOL_VERSION,
  type RealtimeEnvelope,
  type RealtimeEventEnvelope,
  type RealtimeResponseEnvelope,
} from "@morfa/shared/realtime";
import type { WebSocket } from "ws";

import type { UserRow } from "../db/users.js";
import { ApiError } from "../lib/errors.js";
import {
  onRealtimeEvent,
  publishRealtimeEvent,
  type RealtimeUserEvent,
} from "./events.js";
import {
  realtimeOperations,
  type RealtimeOperationContext,
} from "./registry.js";

const MAX_MODULE_LENGTH = 64;
const MAX_ACTION_LENGTH = 64;
const MAX_EVENT_LENGTH = 64;
const HEARTBEAT_INTERVAL_MS = 25_000;
const SUBSCRIPTION_SEPARATOR = "\u0000";

interface RealtimeConnection {
  id: string;
  socket: WebSocket;
  user: UserRow;
  sessionTokenHash: string;
  subscriptions: Set<string>;
  alive: boolean;
}

interface AttachInput {
  socket: WebSocket;
  user: UserRow;
  sessionTokenHash: string;
}

function messageId(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 120
    ? value
    : undefined;
}

function nameValue(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_MODULE_LENGTH
  ) {
    throw new ApiError(
      400,
      "REALTIME_INVALID_MESSAGE",
      `${label} 不正确`,
    );
  }
  return value;
}

function eventName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_EVENT_LENGTH
  ) {
    throw new ApiError(
      400,
      "REALTIME_INVALID_MESSAGE",
      "事件名不正确",
    );
  }
  return value;
}

function subscriptionKey(module: string, event: string): string {
  return `${module}${SUBSCRIPTION_SEPARATOR}${event}`;
}

function errorPayload(error: unknown) {
  if (error instanceof ApiError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: "REALTIME_INTERNAL_ERROR",
    message: "实时请求处理失败",
  };
}

function parseEnvelope(raw: Buffer): RealtimeEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new ApiError(
      400,
      "REALTIME_INVALID_JSON",
      "WebSocket 消息不是有效 JSON",
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(
      400,
      "REALTIME_INVALID_MESSAGE",
      "WebSocket 消息格式不正确",
    );
  }

  const envelope = parsed as RealtimeEnvelope;
  if (envelope.v !== REALTIME_PROTOCOL_VERSION) {
    throw new ApiError(
      400,
      "REALTIME_VERSION_UNSUPPORTED",
      "实时协议版本不受支持",
    );
  }

  return envelope;
}

export class RealtimeGateway {
  private readonly connections = new Map<string, RealtimeConnection>();
  private readonly connectionsByUser = new Map<string, Set<string>>();
  private readonly stopEvents: () => void;
  private heartbeat: NodeJS.Timeout | null = null;
  private sequence = 0;

  constructor() {
    this.stopEvents = onRealtimeEvent((event) => this.dispatch(event));
    this.startHeartbeat();
  }

  attach(input: AttachInput) {
    const connection: RealtimeConnection = {
      id: crypto.randomUUID(),
      socket: input.socket,
      user: input.user,
      sessionTokenHash: input.sessionTokenHash,
      subscriptions: new Set(),
      alive: true,
    };

    this.connections.set(connection.id, connection);
    const userConnections =
      this.connectionsByUser.get(connection.user.id) ?? new Set<string>();
    userConnections.add(connection.id);
    this.connectionsByUser.set(connection.user.id, userConnections);

    input.socket.on("pong", () => {
      connection.alive = true;
    });
    input.socket.on("message", (raw) => {
      void this.handleRawMessage(connection, raw as Buffer);
    });
    input.socket.on("close", () => this.removeConnection(connection.id));
    input.socket.on("error", () => this.removeConnection(connection.id));

    this.send(connection, {
      v: REALTIME_PROTOCOL_VERSION,
      type: "event",
      module: "system",
      event: "ready",
      payload: {
        connectionId: connection.id,
        protocolVersion: REALTIME_PROTOCOL_VERSION,
      },
    });

    publishRealtimeEvent({
      userId: connection.user.id,
      module: "realtime",
      event: "connected",
      payload: { connectionId: connection.id },
    });
  }

  closeUserConnections(
    userId: string,
    reason = "SESSION_CHANGED",
    code: number = REALTIME_CLOSE_CODES.unauthorized,
  ) {
    const ids = [...(this.connectionsByUser.get(userId) ?? [])];
    for (const id of ids) {
      const connection = this.connections.get(id);
      connection?.socket.close(code, reason);
      if (connection) this.removeConnection(id);
    }
  }

  closeAll(reason = "SERVER_SHUTDOWN") {
    for (const connection of this.connections.values()) {
      connection.socket.close(
        REALTIME_CLOSE_CODES.serverShutdown,
        reason,
      );
    }
    this.connections.clear();
    this.connectionsByUser.clear();
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.stopEvents();
  }

  private startHeartbeat() {
    this.heartbeat = setInterval(() => {
      for (const connection of [...this.connections.values()]) {
        if (!connection.alive) {
          connection.socket.terminate();
          this.removeConnection(connection.id);
          continue;
        }
        connection.alive = false;
        try {
          connection.socket.ping();
        } catch {
          this.removeConnection(connection.id);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref?.();
  }

  private removeConnection(connectionId: string) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    this.connections.delete(connectionId);
    const userConnections = this.connectionsByUser.get(connection.user.id);
    userConnections?.delete(connectionId);
    if (userConnections?.size === 0) {
      this.connectionsByUser.delete(connection.user.id);
    }

    publishRealtimeEvent({
      userId: connection.user.id,
      module: "realtime",
      event: "disconnected",
      payload: { connectionId },
    });
  }

  private send(connection: RealtimeConnection, envelope: RealtimeEnvelope) {
    if (connection.socket.readyState !== connection.socket.OPEN) return;
    try {
      connection.socket.send(JSON.stringify(envelope));
    } catch {
      this.removeConnection(connection.id);
    }
  }

  private sendError(
    connection: RealtimeConnection,
    id: string | undefined,
    error: unknown,
  ) {
    const payload = errorPayload(error);
    const response: RealtimeResponseEnvelope = {
      v: REALTIME_PROTOCOL_VERSION,
      type: "response",
      id: id ?? "unknown",
      ok: false,
      error: payload,
    };
    this.send(connection, response);

    if (!id) {
      const event: RealtimeEventEnvelope = {
        v: REALTIME_PROTOCOL_VERSION,
        type: "event",
        module: "system",
        event: "error",
        payload,
      };
      this.send(connection, event);
    }
  }

  private async handleRawMessage(
    connection: RealtimeConnection,
    raw: Buffer,
  ) {
    let envelope: RealtimeEnvelope;
    try {
      envelope = parseEnvelope(raw);
    } catch (error) {
      this.sendError(connection, undefined, error);
      return;
    }

    if (envelope.type === "request") {
      await this.handleRequest(connection, envelope);
      return;
    }

    if (
      envelope.type === "subscribe" ||
      envelope.type === "unsubscribe"
    ) {
      this.handleSubscription(connection, envelope);
      return;
    }

    this.sendError(
      connection,
      messageId(envelope.id),
      new ApiError(
        400,
        "REALTIME_INVALID_MESSAGE",
        "客户端消息类型不正确",
      ),
    );
  }

  private async handleRequest(
    connection: RealtimeConnection,
    envelope: RealtimeEnvelope,
  ) {
    const id = messageId(envelope.id);
    if (!id) {
      this.sendError(
        connection,
        undefined,
        new ApiError(400, "REALTIME_INVALID_MESSAGE", "请求缺少 id"),
      );
      return;
    }

    try {
      const module = nameValue(envelope.module, "模块名");
      const action = nameValue(envelope.action, "操作名");
      const context: RealtimeOperationContext = {
        user: connection.user,
        sessionTokenHash: connection.sessionTokenHash,
        connectionId: connection.id,
      };
      const payload = await realtimeOperations.invoke(
        module,
        action,
        context,
        envelope.payload,
      );

      this.send(connection, {
        v: REALTIME_PROTOCOL_VERSION,
        type: "response",
        id,
        ok: true,
        payload,
      });
    } catch (error) {
      this.sendError(connection, id, error);
    }
  }

  private handleSubscription(
    connection: RealtimeConnection,
    envelope: RealtimeEnvelope,
  ) {
    try {
      const module = nameValue(envelope.module, "模块名");
      const event = eventName(envelope.event);
      const key = subscriptionKey(module, event);

      if (envelope.type === "subscribe") {
        connection.subscriptions.add(key);
      } else {
        connection.subscriptions.delete(key);
      }

      if (envelope.id) {
        this.send(connection, {
          v: REALTIME_PROTOCOL_VERSION,
          type: "response",
          id: envelope.id,
          ok: true,
          payload: {
            module,
            event,
            subscribed: envelope.type === "subscribe",
          },
        });
      }
    } catch (error) {
      this.sendError(connection, messageId(envelope.id), error);
    }
  }

  private dispatch(event: RealtimeUserEvent) {
    const ids = this.connectionsByUser.get(event.userId);
    if (!ids) return;

    const key = subscriptionKey(event.module, event.event);
    for (const id of ids) {
      const connection = this.connections.get(id);
      if (!connection || !connection.subscriptions.has(key)) continue;

      this.sequence += 1;
      this.send(connection, {
        v: REALTIME_PROTOCOL_VERSION,
        type: "event",
        module: event.module,
        event: event.event,
        payload: event.payload,
        seq: this.sequence,
      });
    }
  }
}
