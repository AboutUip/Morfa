# ADR 0007: Single WebSocket Realtime Channel

> 中文原文：[0007-realtime-websocket.md](0007-realtime-websocket.md)
>
> Status: Accepted · Date: 2026-11-26

## Context

Preference sync initially used HTTP snapshots plus focus/polling, which caused duplicate requests and did not suit later collaboration, notification, and streaming scenarios. Morfa needs a unified realtime transport layer while avoiding stuffing every request into WebSocket.

## Decision

1. **One WebSocket connection with multiplexed messages**: one connection per web page, not split by module.
2. **Unified envelope**: `v / id / type / module / action / payload / error / seq`. Requests, responses, subscriptions, and events share the same protocol.
3. **Operation registry**: Realtime operations are registered by `module.action` and call the same services as HTTP; business logic is not duplicated.
4. **Domain event push**: Business services publish user-level events, and the gateway pushes them according to connection subscriptions; services do not manipulate sockets directly.
5. **Transport boundaries**: High-frequency, small-payload, subscription, and push traffic goes over WebSocket; one-off, file, sensitive operations, and public MCP continue over HTTP.
6. **Authentication and lifecycle**: Session cookie + Origin validation; logout, password change, password reset, and account deletion close the relevant connections.
7. **Client singleton**: Request IDs, timeouts, pending map, automatic resubscription, heartbeat, exponential backoff, and HTTP fallback.

## Consequences

- `/api/me/preferences` is no longer polled; login fetches a snapshot once, after which `preferences.changed` is pushed.
- Language / theme changes made through MCP, HTTP, or another tab update online pages immediately.
- Future notifications, Agent streams, model test progress, and canvas collaboration will all connect through the same gateway.
- The realtime protocol is an internal web client channel; external MCP continues to use standard HTTP JSON-RPC.
- Multi-instance deployment requires replacing the domain event bus with Redis / NATS and ensuring the instance holding a connection receives events.
- WebSocket proxying, idle timeouts, message size, connection rate limiting, and replay policy are key operational follow-ups.
