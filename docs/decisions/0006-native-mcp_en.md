# ADR 0006: Native MCP and the API Key Permission Model

> 中文原文：[0006-native-mcp.md](0006-native-mcp.md)
>
> Status: Accepted · Date: 2026-11-26

## Context

Morfa needs to expose account, appearance, export, and model-provider capabilities to MCP clients and internal modules. Sensitive capabilities are already protected with VCode or the current password, but external API keys cannot reuse web sessions directly, nor can a key itself be treated as full account permission.

## Decision

1. **Native MCP server**: Implement `POST /mcp` in the API service using JSON-RPC 2.0 with stateless authentication; do not introduce a separate MCP process.
2. **Single central controller**: All capabilities are registered and executed by `src/mcp/McpController`, which uniformly handles parameter schemas, permissions, `tools/list` filtering, `tools/call` results, and `llms.txt` generation. New modules only register capability definitions.
3. **API key**: The plaintext is returned only once at creation; the database stores only the SHA-256 hash and a display prefix. Each key has two independent permission bits:
   - VCode-sensitive capabilities: `vcode` must be passed when calling;
   - Password-sensitive capabilities: the current account's `password` must be passed when calling.
   Capabilities requiring both require the key to have both permission bits enabled.
4. **Capability discovery**: `tools/list` returns only capabilities callable by the current key; `search_mcp_capabilities` / `get_mcp_capability` can query locked capabilities and their requirements. A REST discovery and invocation API sharing the same controller is also provided.
5. **Preference sync**: Language and theme are written to `user_preferences`; after web login the client reads a snapshot once and subscribes to `preferences.changed` over the realtime channel; after an MCP change, the server pushes it directly to online pages.

## Consequences

- External MCP clients and internal modules share one set of capability definitions and permission checks, so behaviors cannot diverge.
- Adding a capability requires only a definition and an execution function; if a sensitive capability forgets to declare a parameter, the central controller still enforces `vcode` / `password` validation.
- API keys cannot escalate privileges or view other keys, and are deleted together with sessions when an account is deleted.
- The current MCP transport is a stateless JSON response; if server-initiated notifications are needed later, an SSE session layer can be added without changing the capability registry.
- Production deployment must reverse-proxy `/mcp`, `/llms.txt`, `/api`, and `/uploads` to the API service, and pin the external address with `APP_ORIGIN`.
