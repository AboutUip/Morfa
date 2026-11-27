# Backend Architecture

> 中文原文：[backend.md](backend.md)
>
> Status: M1 authentication, VCode, accounts, export, model providers, model testing, API Keys, MCP, and realtime channel implemented · Last updated: 2026-11-26

## Responsibilities

The Node.js service handles authentication, persistence of projects and design documents, asset management, Agent orchestration, and the public API. The front end never touches the database directly; every write goes through validation and permission checks.

## Technology choices

| Item | Choice | Status |
| --- | --- | --- |
| Runtime | Node.js >= 22 (LTS) | Integrated |
| Language | TypeScript (strict) | Integrated |
| HTTP / WS framework | Fastify 5 + `@fastify/websocket` | Integrated (authentication, models, MCP, and realtime channel) |
| Validation | Zod (reusing shared schemas) | Recommended; handwritten validation for now |
| Database | SQLite (WAL) | Integrated (auth, VCode, exports, projects, model providers, preferences, and API keys) |
| Data access | `node:sqlite` (native) | Integrated; ORM under evaluation |
| Agent streaming protocol | XAIOP Node SDK | Vendored; application integration not started; see [XAIOP integration](../integrations/xaiop_en.md) |
| Logging | Pino (structured JSON) | Recommended |
| Testing | Vitest + Supertest / Fastify inject | Recommended |

Choices are confirmed during M1 implementation and recorded in ADRs; for database conventions see [Database design](database_en.md).

## Directory conventions

```text
apps/server/
├─ src/
│  ├─ api/                 # Routes, request validation, response serialization
│  ├─ services/            # Business use cases: projects, design documents, users
│  ├─ db/                  # Connection, schema, repositories, migration runner
│  ├─ agent/               # Orchestrator, model adapters, tool registry, run records
│  ├─ mcp/                 # MCP controller, capability registry, API Key authentication, llms.txt
│  ├─ realtime/            # WebSocket gateway, operation registry, subscriptions, domain events
│  └─ lib/                 # Configuration, logging, errors, authentication, and other infrastructure
├─ migrations/             # Sequentially numbered SQL migrations
├─ data/                   # Local SQLite files (not committed)
└─ README.md
```

Layering rules:

- `api` only performs HTTP adaptation and contains no business logic.
- `services` orchestrates use cases, receives validated input, and returns domain results.
- `db` encapsulates SQL and transactions and does not depend on HTTP types.
- `agent` reads and writes design documents through service interfaces and never assembles SQL directly.

## Implemented: authentication, account, model provider, MCP, and realtime APIs

- `GET /api/health`: Health check.
- `GET /api/auth/me`: Reads the current session user; returns `{ user: null }` when signed out. When the session user is missing a VCode or has been cancelled, the server deletes the session and clears the cookie.
- `POST /api/auth/login`: JSON sign-in; on success writes the `morfa_session` cookie. When the account is missing a VCode, returns `requiresVCodeSetup` and a short-lived setup token without creating a session.
- `POST /api/auth/vcode-setup`: Validates the setup token and the 6-digit VCode, writes the VCode hash, and creates a session.
- `POST /api/auth/register`: `multipart/form-data` with fields `avatar`, `nickname`, `loginAccount`, `password`, `confirmPassword`, and `vcode`, plus optional `importOriginalAccount` and `archive`; on success creates a session and signs the user in automatically.
- `POST /api/auth/logout`: Deletes the session and clears the cookie.
- `PATCH /api/me/profile`: Updates the nickname.
- `POST /api/me/avatar`: Uploads a new avatar; after a successful write, the old avatar file is deleted.
- `POST /api/me/password/verify`: Verifies only the current password, for the password verification dialog and the sequential account-cancellation flow.
- `POST /api/me/password`: Verifies the current password and then changes it; the new password is submitted only once; the current session is kept and other sessions are revoked.
- `POST /api/me/vcode/verify`: Verifies the VCode and returns a sensitive-operation ticket valid for 5 minutes.
- `POST /api/me/password/forgot`: After consuming a `password_reset` ticket, sets a new password directly without the old password; the new password is submitted only once.
- `GET /api/me/export`: Reads the status of the current valid export archive.
- `POST /api/me/export`: Consumes the `export` ticket, generates a new encrypted export archive, and immediately invalidates the old archive.
- `GET /api/me/export/download`: Downloads the current valid export archive.
- `POST /api/me/cancel`: Verifies the current password and consumes the `cancel` ticket, soft-deletes the account, clears the password and VCode, and revokes all sessions.
- `GET /api/me/model-providers`: Reads the current user's model providers and fetched models.
- `POST /api/me/model-providers`: Creates an OpenAI / Anthropic provider; the server requests the model list and saves the provider only after success.
- `POST /api/me/model-providers/:id/sync`: Fetches the model list again using the stored API key; manual capability configuration for existing models is preserved.
- `PATCH /api/me/model-providers/:id/models`: Updates `supportsStreaming`, `supportsThinking`, and `supportsMultimodal` by `modelId`, returning the updated provider.
- `POST /api/me/model-providers/:id/test`: Makes a real model call and streams `start`, `reasoning`, `delta`, `done`, and `error` events as `application/x-ndjson`; it can automatically choose streaming / non-streaming based on model capabilities and sends the provider-specific reasoning parameters when thinking is enabled.
- `DELETE /api/me/model-providers/:id`: Deletes the provider and cascades to its models.
- `POST /api/me/model-providers/:id/reveal-key`: Consumes the `reveal_api_key` ticket and then returns the decrypted API key.
- `GET /api/me/preferences` / `PATCH`: Reads or updates account-level language and theme preferences; returns `null` when unset, and the front end keeps its local setting. The HTTP endpoint serves as a one-shot snapshot and a fallback when WebSocket is unavailable.
- `GET /api/realtime`: WebSocket Upgrade endpoint, authenticated with the session cookie plus Origin validation; the envelope is `v / id / type / module / action / payload`, supporting requests, subscriptions, and server push.
- `preferences.get` / `preferences.update`: Call the same preference service through the realtime operation registry; after an update, publishes `preferences.changed` to all of the user's online connections.
- `GET /api/me/api-keys` / `POST` / `PATCH /:id` / `DELETE /:id`: Manage MCP API Keys. Plaintext is returned only once in the creation response; the database stores a SHA-256 hash and a display prefix.
- `POST /mcp`: MCP JSON-RPC 2.0 endpoint authenticated with `Authorization: Bearer mf_...`; supports `initialize`, `ping`, `tools/list`, `tools/call`, and notification requests.
- `GET /api/mcp/capabilities` / `GET /api/mcp/capabilities/:name` / `POST /api/mcp/capabilities/:name/call`: Share the same capability registry and permission checks as MCP, making it easy for other modules to integrate.
- `GET /api/mcp/export/latest`: Downloads the current valid export archive with an API key.
- `GET /api/me/mcp/capabilities` / `GET /api/me/mcp/capabilities/:name`: Let the web profile panel read the complete capability catalog.
- `GET /llms.txt`: Public MCP documentation generated automatically from the capability registry, including input schemas and call examples.
- `GET /uploads/avatars/:filename`: Reads an avatar.
- Login accounts are lowercased before being stored; the database uses `COLLATE NOCASE UNIQUE` for deduplication.
- Passwords and VCodes both use `scrypt` + random salt hashing; session tokens, setup tokens, and sensitive-operation tickets are stored only as SHA-256 hashes.
- VCode verification failures are rate-limited per user (5 times per 10 minutes); after successful verification a ticket can be consumed only once.
- Export archives are encrypted with AES-256-GCM using a random data key, which is then wrapped by the server master key; the master key comes from `MORFA_EXPORT_MASTER_KEY` or the local `data/export-master.key`.
- Model provider API Keys are stored encrypted with AES-256-GCM using the same server master key; list endpoints do not return keys, and a key can only be decrypted and viewed after consuming a `reveal_api_key` ticket.
- Model lists are requested by the server from providers, restricted to HTTP / HTTPS with a 15-second timeout, and neither API Keys nor response bodies are logged; self-hosted deployments should assess Base URL SSRF risk together with outbound network policy.
- Model capabilities are stored alongside the model. When fetching the model list, streaming / thinking / multimodal capabilities are detected from metadata such as `capabilities`, `supported_parameters`, and `architecture`; when detection is unreliable, minimal defaults are used (streaming on, thinking and multimodal off), and a `PATCH` endpoint lets users correct them manually.
- Model tests use a fixed prompt to verify that the model actually returns content; the OpenAI protocol sends `reasoning_effort`, and the Anthropic protocol sends `thinking` with the corresponding token budget. Streaming requests are parsed incrementally as SSE, the upstream request is aborted when the client disconnects, and a single test lasts at most 60 seconds. Empty responses, authentication failures, timeouts, stream format errors, and upstream errors each return a stable error code.
- MCP capabilities are registered and executed uniformly by `src/mcp/McpController`: a capability definition includes a bilingual title / description, JSON schema, permission requirements, examples, and read-only / destructive annotations. The controller handles parameter validation, API Key permissions, `tools/list` filtering, `tools/call` result wrapping, and `llms.txt` generation; a new module only needs to `register()` one capability definition.
- API Keys have two independent permission bits: VCode and password. A capability declares the permissions it requires; on every call the controller checks the key's permissions and verifies the `vcode` / `password` in the call arguments; a capability requiring both requires the key to have both permission bits enabled. See [MCP integration](../integrations/mcp_en.md).
- Language and theme preferences are written to `user_preferences`; after a change the domain layer publishes `preferences.changed`, and the WebSocket gateway pushes to the user's subscriptions, so polling is no longer needed. For realtime gateway authentication, reconnection, envelopes, and extension, see [Realtime channel](realtime_en.md).
- Avatar files are written to `apps/server/data/uploads/avatars/`; the database stores only the relative path `uploads/avatars/<uuid>.<ext>`, with PNG / JPG / WebP limited to 2 MB.
- For detailed trade-offs, see [ADR 0005](../decisions/0005-auth-and-avatar_en.md).

## API conventions

- Existing authentication endpoints live under `/api/auth/*`; the versioned prefix `/api/v1` will be evaluated as a whole when the project / design document APIs land.
- Format: JSON; uploads use `multipart/form-data`.
- Authentication: cookie session or Bearer token (TBD); write operations always check permissions.
- Error responses:

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "项目不存在或无权访问",
    "details": {},
    "requestId": "req_..."
  }
}
```

- Every response carries a `requestId`; logs and error tracking use the same ID.
- List endpoints use cursor pagination; timestamps are uniformly UTC milliseconds.
- Agent streaming output is pushed over the existing single WebSocket realtime channel (see [Realtime channel](realtime_en.md)); planned event types include `run.started`, `message.delta`, `tool.started`, `tool.finished`, `patch.proposed`, `run.finished`, and `run.failed`. Incremental payloads are planned to use XAIOP encoding, produced by the server with the Node SDK and parsed by the front end with the browser SDK; the mapping between events and XAIOP payloads is not implemented yet; see [XAIOP integration](../integrations/xaiop_en.md).

## Module breakdown (planned)

| Module | Main capabilities |
| --- | --- |
| auth | Registration / sign-in / sessions, password hashing, sign-out |
| projects | Project CRUD, members and visibility (later) |
| designs | Design document reads, patch submission, versions and snapshots |
| assets | Image upload, metadata, access control |
| agent | Run creation, orchestration, tool calls, event streams, history |
| share | Read-only share links (later) |
| health | Liveness and readiness checks |

## Configuration

- Injected through environment variables; local development uses `.env` (not committed), with `.env.example` provided.
- Key settings: `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `MODEL_PROVIDER`, `MODEL_API_KEY`, `LOG_LEVEL`, `APP_ORIGIN`.
- Validate configuration at startup (Zod); missing or invalid values fail immediately to avoid running in a broken state.

## Security

- All input is validated with schemas; SQL runs only through parameterized queries or an ORM.
- Authentication: passwords use scrypt hashing; session tokens are randomly generated and only hashes are stored in the database; cookies are `HttpOnly; SameSite=Lax`.
- Uploads: avatars are restricted by MIME type, file signature, and 2 MB size; file names are generated by the server, and path traversal is forbidden.
- Rate-limit sign-in, generation, and upload endpoints; record audit logs for sensitive operations.
- Uploaded files are checked for MIME type, extension, and size, stored in a non-public directory, and read through controlled endpoints.
- Agent tools run with least privilege; model output must never be concatenated directly into SQL, shell, or file paths.
- Treat user content as untrusted input and guard against prompt injection; secrets never enter the model context.
- Set security response headers (CSP, HSTS, X-Content-Type-Options, etc.).

## Observability

- Structured logging: request, duration, status code, `requestId`; errors include stacks but filter sensitive fields.
- Metrics: request volume, latency percentiles, error rate, Agent run success rate, and token consumption.
- Agent run records are persisted and can be searched and replayed by user / project.

## Testing and quality

- Service-layer unit tests cover permissions, state transitions, and transaction boundaries.
- API integration tests use a temporary SQLite database, isolated per test case.
- Agent orchestration uses replaceable model adapters for deterministic tests (recorded / simulated responses).

## Open questions

- The final HTTP framework choice (Fastify / Express / Hono).
- The session approach: server-side session table or signed token.
- Long-task execution: in-process task table, Worker Threads, or a separate queue.
- The file storage abstraction and production deployment shape (single-machine disk / object storage).
- A unified abstraction for model providers and streaming protocols.
