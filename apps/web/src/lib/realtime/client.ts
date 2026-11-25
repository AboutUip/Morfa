import {
  REALTIME_CLOSE_CODES,
  REALTIME_PROTOCOL_VERSION,
  type RealtimeConnectionStatus,
  type RealtimeEnvelope,
  type RealtimeEventEnvelope,
  type RealtimeResponseEnvelope,
} from "@morfa/shared/realtime";

const CONNECT_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;
const RECONNECT_MAX_DELAY_MS = 10_000;
const RECONNECT_BASE_DELAY_MS = 500;

export class RealtimeRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RealtimeRequestError";
    this.code = code;
  }
}

type RealtimeEventHandler = (
  payload: unknown,
  envelope: RealtimeEventEnvelope,
) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

function requestUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/realtime`;
}

class RealtimeClient {
  private socket: WebSocket | null = null;
  private status: RealtimeConnectionStatus = "closed";
  private connectPromise: Promise<void> | null = null;
  private connectReject: ((error: Error) => void) | null = null;
  private manualClose = false;
  private hasOpened = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private sequence = 0;

  private readonly pending = new Map<string, PendingRequest>();
  private readonly subscriptions = new Map<
    string,
    Set<RealtimeEventHandler>
  >();
  private readonly openListeners = new Set<
    (reconnected: boolean) => void
  >();

  getStatus(): RealtimeConnectionStatus {
    return this.status;
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  ensureConnected(): Promise<void> {
    if (this.isOpen()) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.manualClose = false;
    this.connectPromise = this.openSocket();
    return this.connectPromise;
  }

  disconnect() {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.rejectPending(
      new RealtimeRequestError(
        "REALTIME_DISCONNECTED",
        "实时连接已断开",
      ),
    );
    this.subscriptions.clear();
    this.connectReject = null;
    this.connectPromise = null;
    this.socket?.close(1000, "CLIENT_LOGOUT");
    this.socket = null;
    this.status = "closed";
  }

  async request<T>(
    module: string,
    action: string,
    payload: unknown = null,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    await this.ensureConnected();
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new RealtimeRequestError(
        "REALTIME_NOT_CONNECTED",
        "实时连接尚未建立",
      );
    }

    const id = `r_${Date.now().toString(36)}_${++this.sequence}`;

    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(
          new RealtimeRequestError(
            "REALTIME_TIMEOUT",
            "实时请求超时",
          ),
        );
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      try {
        socket.send(
          JSON.stringify({
            v: REALTIME_PROTOCOL_VERSION,
            type: "request",
            id,
            module,
            action,
            payload,
          }),
        );
      } catch {
        window.clearTimeout(timer);
        this.pending.delete(id);
        reject(
          new RealtimeRequestError(
            "REALTIME_SEND_FAILED",
            "实时请求发送失败",
          ),
        );
      }
    });
  }

  subscribe(
    module: string,
    event: string,
    handler: RealtimeEventHandler,
  ): () => void {
    const key = `${module}\u0000${event}`;
    const handlers = this.subscriptions.get(key) ?? new Set();
    const first = handlers.size === 0;
    handlers.add(handler);
    this.subscriptions.set(key, handlers);

    if (first) {
      if (this.isOpen()) {
        this.sendSubscription("subscribe", module, event);
      } else {
        void this.ensureConnected().catch(() => {
          // 连接失败时保留订阅，后续重连会自动补发
        });
      }
    }

    return () => {
      const current = this.subscriptions.get(key);
      if (!current) return;
      current.delete(handler);
      if (current.size > 0) return;
      this.subscriptions.delete(key);
      if (this.isOpen()) {
        this.sendSubscription("unsubscribe", module, event);
      }
    };
  }

  onReconnected(listener: (reconnected: boolean) => void): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  private openSocket(): Promise<void> {
    this.status = this.hasOpened ? "reconnecting" : "connecting";
    const socket = new WebSocket(requestUrl());
    this.socket = socket;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      this.connectReject = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      };

      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        this.connectReject = null;
        this.connectPromise = null;
        socket.close();
        reject(
          new RealtimeRequestError(
            "REALTIME_CONNECT_TIMEOUT",
            "实时连接超时",
          ),
        );
      }, CONNECT_TIMEOUT_MS);

      socket.addEventListener(
        "open",
        () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          this.connectReject = null;
          this.connectPromise = null;
          this.status = "open";
          this.reconnectAttempts = 0;
          this.clearReconnectTimer();
          this.resubscribeAll();

          const reconnected = this.hasOpened;
          this.hasOpened = true;
          for (const listener of this.openListeners) {
            try {
              listener(reconnected);
            } catch {
              // 监听器失败不影响连接
            }
          }

          resolve();
        },
        { once: true },
      );

      socket.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });

      socket.addEventListener("close", (event) => {
        if (settled) {
          window.clearTimeout(timeout);
        }
        this.handleClose(event, socket);
      });

      socket.addEventListener("error", () => {
        this.connectReject?.(
          new RealtimeRequestError(
            "REALTIME_CONNECT_FAILED",
            "无法建立实时连接",
          ),
        );
      });
    });
  }

  private handleClose(event: CloseEvent, socket: WebSocket) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.status = "closed";
    this.connectPromise = null;
    this.connectReject?.(new RealtimeConnectionClosedError(event.code));
    this.connectReject = null;
    this.rejectPending(
      new RealtimeRequestError(
        "REALTIME_DISCONNECTED",
        "实时连接已断开",
      ),
    );

    if (
      this.manualClose ||
      event.code === REALTIME_CLOSE_CODES.unauthorized ||
      event.code === REALTIME_CLOSE_CODES.forbidden
    ) {
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;

    this.reconnectAttempts += 1;
    const delay =
      Math.min(
        RECONNECT_MAX_DELAY_MS,
        RECONNECT_BASE_DELAY_MS * 2 ** (this.reconnectAttempts - 1),
      ) + Math.floor(Math.random() * 250);

    this.status = "reconnecting";
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnected().catch(() => {
        // close 事件会继续安排下一次重连
      });
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private resubscribeAll() {
    for (const key of this.subscriptions.keys()) {
      const [module, event] = key.split("\u0000");
      if (module && event) {
        this.sendSubscription("subscribe", module, event);
      }
    }
  }

  private sendSubscription(
    type: "subscribe" | "unsubscribe",
    module: string,
    event: string,
  ) {
    if (!this.isOpen()) return;
    this.socket?.send(
      JSON.stringify({
        v: REALTIME_PROTOCOL_VERSION,
        type,
        module,
        event,
      }),
    );
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== "string") return;

    let envelope: RealtimeEnvelope;
    try {
      envelope = JSON.parse(raw) as RealtimeEnvelope;
    } catch {
      return;
    }

    if (envelope.v !== REALTIME_PROTOCOL_VERSION) return;

    if (envelope.type === "response") {
      this.handleResponse(envelope as RealtimeResponseEnvelope);
      return;
    }

    if (envelope.type === "event") {
      this.handleEvent(envelope as RealtimeEventEnvelope);
    }
  }

  private handleResponse(envelope: RealtimeResponseEnvelope) {
    if (!envelope.id) return;
    const pending = this.pending.get(envelope.id);
    if (!pending) return;

    this.pending.delete(envelope.id);
    window.clearTimeout(pending.timer);

    if (envelope.ok) {
      pending.resolve(envelope.payload);
      return;
    }

    pending.reject(
      new RealtimeRequestError(
        envelope.error?.code ?? "REALTIME_REQUEST_FAILED",
        envelope.error?.message ?? "实时请求失败",
      ),
    );
  }

  private handleEvent(envelope: RealtimeEventEnvelope) {
    const key = `${envelope.module}\u0000${envelope.event}`;
    const handlers = this.subscriptions.get(key);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(envelope.payload, envelope);
      } catch {
        // 单个订阅者失败不影响其他订阅者
      }
    }
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

class RealtimeConnectionClosedError extends Error {
  readonly code: number;

  constructor(code: number) {
    super("实时连接已关闭");
    this.name = "RealtimeConnectionClosedError";
    this.code = code;
  }
}

export const realtimeClient = new RealtimeClient();
