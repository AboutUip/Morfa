# MCP Integration

> 中文原文：[mcp.md](mcp.md)
>
> Status: Implemented · Last updated: 2026-11-27

Morfa ships a native Model Context Protocol (MCP) server that securely exposes account, project canvas, behavior, control, preview, and model provider capabilities to MCP clients or internal modules. `GET /llms.txt` is the parameter source of truth.

## Endpoint and transport

| Item | Value |
| --- | --- |
| MCP JSON-RPC | `POST /mcp` |
| Transport | HTTP + JSON-RPC 2.0; each request returns JSON, with no long-lived connection |
| Protocol versions | `2024-11-05` / `2025-03-26` / `2025-06-18` |
| Authentication | `Authorization: Bearer mf_...` or `x-api-key: mf_...` |
| Documentation | `GET /llms.txt` |

The current implementation is a stateless MCP server: every request authenticates independently and does not rely on `Mcp-Session-Id`. It supports `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, and `prompts/list`, and returns `202` for notification requests.

## Controller and capability registration

All MCP capabilities are managed by `apps/server/src/mcp/McpController`:

```text
apps/server/src/mcp/
├─ controller.ts       # Capability registration, search, details, permission checks, invocation
├─ runtime.ts          # Process-wide shared MCP controller instance
├─ types.ts            # Capability definitions, input schemas, context, and DTOs
├─ schema.ts           # Lightweight argument validation
├─ auth.ts             # API key authentication and request origin
├─ docs.ts             # llms.txt generation
└─ capabilities/
   ├─ meta.ts          # Status, search, details
   ├─ appearance.ts    # Language, theme
   ├─ profile.ts       # Nickname, avatar
   ├─ security.ts      # Password change, account cancellation
   ├─ data.ts          # Export
   ├─ models.ts        # Model providers and sub-capabilities
   ├─ projects.ts      # Projects
   ├─ canvas.ts        # Pages, widgets, links
   ├─ canvasNavigation.ts
   ├─ layout.ts
   ├─ behavior.ts      # Shared project graph and control graphs
   ├─ controls.ts
   ├─ accountComponents.ts
   ├─ runtime.ts
   ├─ screenshots.ts
   ├─ assets.ts
   ├─ lint.ts
   └─ batch.ts
```

A new module only needs to import the shared controller from `runtime.ts` and register a capability:

```ts
import { mcpController } from "../mcp/runtime.js";

mcpController.register({
  name: "example_capability",
  title: { "zh-CN": "示例能力", "en-US": "Example capability" },
  description: { "zh-CN": "……", "en-US": "…" },
  usage: { "zh-CN": "……", "en-US": "…" },
  returns: { "zh-CN": "……", "en-US": "…" },
  category: "system",
  requirements: { vcode: false, password: false },
  annotations: READ_ONLY_ANNOTATIONS,
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  examples: [{ arguments: {} }],
  async execute(context, args) {
    return { ok: true };
  },
});
```

The controller centrally handles argument validation, API key permissions, MCP `tools/list` filtering, `tools/call` result wrapping, REST invocation, and `llms.txt` generation.

## API keys and permissions

API keys are created in the "API" tab of the profile panel. The plaintext is shown only once, on successful creation; the database stores only the SHA-256 hash and a display prefix.

Each key has two independent permission bits:

| Permission bit | Effect | Requirement per call |
| --- | --- | --- |
| VCode-sensitive capabilities | Allow capabilities such as export, account cancellation, and viewing provider keys | Every call must include `vcode` |
| Password-sensitive capabilities | Allow capabilities such as password changes and account cancellation | Every call must include the current account `password` |

Capabilities that require both VCode and password (such as `cancel_account`) require both permission bits to be enabled and both `vcode` and `password` to be provided. The server re-validates on every call and does not cache verification results.

`tools/list` returns only the capabilities the current key can invoke. `search_mcp_capabilities` and `get_mcp_capability` can look up permission-locked capabilities and their requirements, so clients can explain why a capability is unavailable.

## Capability catalog

### System

| Capability | Description | Additional verification |
| --- | --- | --- |
| `get_mcp_status` | Current account, key, permissions, endpoint, and available capability statistics | None |
| `search_mcp_capabilities` | Search capabilities by keyword / category | None |
| `get_mcp_capability` | Get detailed usage and the parameter schema for a capability | None |

### Appearance and profile

| Capability | Description | Additional verification |
| --- | --- | --- |
| `set_language` | Change the account UI language (`zh-CN` / `en-US`) | None |
| `set_theme` | Change the account theme (`system` / `light` / `dark`) | None |
| `update_nickname` | Change the nickname | None |
| `update_avatar` | Change the avatar using Base64 or a data URI | None |

### Security and data

| Capability | Description | Additional verification |
| --- | --- | --- |
| `change_password` | Change the password and revoke other web sessions | Password |
| `cancel_account` | Cancel the account and revoke all sessions and API keys | Password + VCode |
| `get_export_status` | Check for a valid export archive | None |
| `create_export` | Create an encrypted export archive | VCode |

The `downloadUrl` returned by `create_export` points to `/api/mcp/export/latest`; download it with the same API key as a Bearer token.

### Model providers

| Capability | Description | Additional verification |
| --- | --- | --- |
| `list_model_providers` | List providers, models, and capabilities | None |
| `add_model_provider` | Add an OpenAI / Anthropic provider and fetch its models | None |
| `refresh_model_provider` | Re-fetch the model list | None |
| `update_model_capabilities` | Set streaming / thinking / multimodal capabilities | None |
| `test_model` | Make a real model call to verify availability | None |
| `reveal_model_provider_key` | View a provider's plaintext API key | VCode |
| `delete_model_provider` | Delete a provider | None |

### Projects and canvas

| Capability | Purpose |
| --- | --- |
| `list_projects` / `get_project` / `get_project_context` / `create_project` / `update_project` / `delete_project` | List, read, create, rename, and delete projects |
| `get_canvas` | Full canvas, including pages, links, and the shared behavior graph |
| `get_page` / `create_page` / `update_page` / `delete_page` / `duplicate_page` | Page CRUD |
| `update_page_styles` / `update_page_widget` / `update_page_data` | Styles, widgets, and node data |
| `create_link` / `update_link` / `delete_link` / `list_links` | Page links |
| `get_node_context` / `move_page` / `resize_page` / `set_page_parent` / `reorder_layers` | Position, size, parent, and layer order |
| `resolve_layout` / `set_layout` / `batch_update_layout` | Layout resolve and write |
| `upload_asset` / `list_assets` / `delete_asset` | Project assets |

### Behavior

Ordinary pages share `CanvasDocument.behavior`. A control definition keeps its own graph. Event blocks use `nodeId`; judgments and modifications use `targetId`. An empty slot does not affect the clicked node. Legacy `triggers` can still be read, but they are not how new graphs are authored. `setVariable` / `incrementVariable` / `toggleVariable` remain only for migrating old data.

| Capability | Purpose |
| --- | --- |
| `get_behavior` | Omit `pageId` for the shared graph; pass a page id for that page's graph |
| `update_behavior` | Omit `pageId` or pass `__project__` to write the shared graph; a page id changes only that page |
| `validate_behavior` | Validate the shared graph and page graphs, or an unsaved draft |
| `list_supported_events` / `list_actions` / `list_conditions` | Current event, action, and judgment vocabulary |
| `get_lint` / `validate_project` | Layout, link, and behavior checks |

### Controls, preview, and screenshots

| Capability | Purpose |
| --- | --- |
| `list_controls` / `get_control` / `create_control` / `update_control` / `delete_control` / `duplicate_control` | Control definitions |
| `add_control_state` / `update_control_state` / `delete_control_state` | Control states |
| `compile_control` / `list_compiled_components` / `create_control_instance` / `set_control_instance_state` | Compile, instances, and state switching |
| `list_account_components` / `publish_account_component` / `import_account_component` / `delete_account_component` | Account component library |
| `get_runtime_screens` / `compile_preview` / `get_preview_status` / `capture_simulator` | Runtime preview |
| `capture_page` / `capture_canvas` / `capture_node` / `list_screenshot_audits` | Screenshots |
| `batch_apply` | Run up to 200 canvas, layout, or behavior writes in order |

## Discovery and invocation API

In addition to the MCP protocol, the same capabilities are exposed over REST so other modules or non-MCP clients can integrate:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/mcp/capabilities` | List the capabilities available to the current key; `?availableOnly=false` returns all capabilities |
| `GET` | `/api/mcp/capabilities/:name` | Get capability details |
| `POST` | `/api/mcp/capabilities/:name/call` | Invoke a capability directly; the request body is the capability arguments |
| `GET` | `/api/mcp/export/latest` | Download the current valid export archive |

All of these endpoints use API key Bearer authentication, and permission rules are identical to MCP `tools/call`.

The Morfa web client reads its MCP capability catalog through the realtime channel's `mcp.capabilities.list` / `mcp.capabilities.get` first, falling back to the HTTP endpoints above when the connection is unavailable; external MCP clients still use only `/mcp` and the public HTTP API.

## llms.txt

`GET /llms.txt` is public Markdown documentation covering endpoints, authentication, permission notes, MCP invocation examples, and the input schema and parameter examples for every capability. The "API" tab of the profile panel also provides an external link and a download button so the document can be handed directly to an LLM.

## Preference synchronization

Language and theme are both stored in the `user_preferences` table. After sign-in, the frontend reads a snapshot once and subscribes to the realtime channel's `preferences.changed` event; when MCP changes the language or theme, the server immediately pushes the change to all of that user's online pages, with no reliance on focus or polling. See [Realtime channel](../architecture/realtime_en.md).

## Security conventions

- API key plaintext is never persisted or logged; the server stores only the SHA-256 hash.
- `tools/list` does not expose capabilities locked for the current key; discovery tools can explain permission requirements but never include credentials.
- VCode and password are verified only for the current tool call; VCode failures use the account-level rate limit.
- Cancelling an account deletes all API keys and web sessions.
- In deployment, pin the external origin with `APP_ORIGIN`, and route `/mcp`, `/llms.txt`, `/api`, and `/uploads` to the API service at the reverse proxy layer.
- Model provider Base URLs are configured by users, and the server makes requests to them; production deployments must still assess SSRF risk from outbound network access.
