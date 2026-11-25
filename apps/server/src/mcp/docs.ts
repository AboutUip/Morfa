import type { McpCapabilityDetail, McpCategory } from "./types.js";
import type { McpController } from "./controller.js";

const CATEGORY_ORDER: McpCategory[] = [
  "system",
  "appearance",
  "profile",
  "security",
  "data",
  "models",
];

const CATEGORY_TITLES: Record<McpCategory, string> = {
  system: "System & discovery",
  appearance: "Appearance",
  profile: "Profile",
  security: "Security",
  data: "Data & export",
  models: "Model providers",
};

function permissionsLabel(capability: McpCapabilityDetail): string {
  const required: string[] = [];
  if (capability.requirements.vcode) required.push("VCode");
  if (capability.requirements.password) required.push("password");
  return required.length > 0
    ? `API key must enable ${required.join(" + ")}; pass ${required
        .map((value) => (value === "password" ? "`password`" : "`vcode`"))
        .join(" and ")} in the call.`
    : "No additional verification required.";
}

function renderCapability(capability: McpCapabilityDetail): string {
  const examples = capability.examples
    .map(
      (example) =>
        `Example arguments:\n\n\`\`\`json\n${JSON.stringify(
          example.arguments,
          null,
          2,
        )}\n\`\`\``,
    )
    .join("\n\n");

  return [
    `#### ${capability.name}`,
    "",
    `**${capability.title["en-US"]}**`,
    "",
    capability.description["en-US"],
    "",
    `Usage: ${capability.usage["en-US"]}`,
    "",
    `Permissions: ${permissionsLabel(capability)}`,
    "",
    `Returns: ${capability.returns["en-US"]}`,
    "",
    "Input schema:",
    "",
    "```json",
    JSON.stringify(capability.inputSchema, null, 2),
    "```",
    "",
    examples,
  ]
    .filter(Boolean)
    .join("\n");
}

export function generateLlmsTxt(
  controller: McpController,
  origin: string,
): string {
  const capabilities = controller.list(null);
  const groups = new Map<McpCategory, McpCapabilityDetail[]>();

  for (const summary of capabilities) {
    const detail = controller.describe(summary.name, null);
    if (!detail) continue;
    const group = groups.get(detail.category) ?? [];
    group.push(detail);
    groups.set(detail.category, group);
  }

  const sections = CATEGORY_ORDER.filter((category) =>
    groups.has(category),
  ).map((category) => {
    const items = groups.get(category) ?? [];
    return [
      `### ${CATEGORY_TITLES[category]}`,
      "",
      items.map(renderCapability).join("\n\n"),
    ].join("\n");
  });

  return [
    "# Morfa MCP",
    "",
    "Morfa is an AI-driven UI design platform. This document describes its native",
    "Model Context Protocol (MCP) server and every capability exposed to MCP clients.",
    "",
    "## Endpoint",
    "",
    `- MCP JSON-RPC endpoint: \`${origin}/mcp\` (HTTP POST, JSON-RPC 2.0)`,
    `- Public documentation: \`${origin}/llms.txt\``,
    `- Capability discovery API: \`GET ${origin}/api/mcp/capabilities\``,
    "  (pass `?availableOnly=false` to include capabilities locked by API key permissions)",
    `- Capability detail API: \`GET ${origin}/api/mcp/capabilities/{name}\``,
    `- Capability invocation API: \`POST ${origin}/api/mcp/capabilities/{name}/call\``,
    "",
    "## Authentication",
    "",
    "Create an API key in the Morfa profile panel, API tab. Send it with every",
    "MCP or discovery request:",
    "",
    "```http",
    "Authorization: Bearer mf_...",
    "Content-Type: application/json",
    "```",
    "",
    "`x-api-key: mf_...` is also accepted.",
    "",
    "## API key permissions",
    "",
    "Each API key has two independent permission switches:",
    "",
    "- **VCode permission**: allows capabilities that require the account's 6-digit",
    "  VCode. The caller must pass `vcode` in the tool arguments on every call.",
    "- **Password permission**: allows capabilities that require the account",
    "  password. The caller must pass `password` in the tool arguments on every call.",
    "",
    "Capabilities that require both (for example `cancel_account`) need both",
    "switches enabled and both arguments supplied.",
    "",
    "`tools/list` only returns capabilities available to the authenticated API key.",
    "`search_mcp_capabilities` and `get_mcp_capability` can inspect locked",
    "capabilities and report their permission requirements.",
    "",
    "## MCP session example",
    "",
    "Initialize:",
    "",
    "```json",
    JSON.stringify(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "example", version: "1.0.0" },
        },
      },
      null,
      2,
    ),
    "```",
    "",
    "List available tools:",
    "",
    "```json",
    '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}',
    "```",
    "",
    "Call a tool:",
    "",
    "```json",
    JSON.stringify(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_mcp_status",
          arguments: {},
        },
      },
      null,
      2,
    ),
    "```",
    "",
    "The server responds with MCP tool content containing JSON. Tool execution",
    "errors are returned as `isError: true` results with a stable error code.",
    "",
    "## Capabilities",
    "",
    sections.join("\n\n"),
    "",
    "## Notes",
    "",
    "- Model provider API keys are encrypted at rest and never returned by list APIs.",
    "- Sensitive capabilities are always re-verified on every call; permissions are",
    "  never cached inside a session.",
    "- Revoking or editing an API key takes effect immediately.",
    "",
  ].join("\n");
}
