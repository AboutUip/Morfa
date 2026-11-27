import { ApiError } from "../lib/errors.js";
import type { ApiKeyRow } from "../db/apiKeys.js";
import type { UserRow } from "../db/users.js";
import { validateArguments } from "./schema.js";
import type {
  McpCapability,
  McpCapabilityDetail,
  McpCapabilitySummary,
  McpCategory,
  McpInvocation,
  McpKeyPermissions,
  McpSearchOptions,
  McpStructuredResult,
  McpToolDefinition,
} from "./types.js";

function isStructuredResult(
  value: unknown,
): value is McpStructuredResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const result = value as Record<string, unknown>;
  return (
    Boolean(result.structuredContent) &&
    typeof result.structuredContent === "object" &&
    !Array.isArray(result.structuredContent)
  );
}

const CATEGORY_ORDER: Record<McpCategory, number> = {
  system: 0,
  appearance: 1,
  profile: 2,
  security: 3,
  data: 4,
  models: 5,
  projects: 6,
  canvas: 7,
  layout: 8,
  behavior: 9,
  controls: 10,
  runtime: 11,
  screenshot: 12,
  assets: 13,
  lint: 14,
};

function compareSummaries(
  left: McpCapabilitySummary,
  right: McpCapabilitySummary,
): number {
  return (
    CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category] ||
    left.name.localeCompare(right.name)
  );
}

export function permissionsFromKey(key: ApiKeyRow): McpKeyPermissions {
  return {
    allowVCode: key.allow_vcode === 1,
    allowPassword: key.allow_password === 1,
  };
}

export function isCapabilityAvailable(
  capability: McpCapability,
  permissions: McpKeyPermissions | null,
): boolean | null {
  if (!permissions) return null;
  if (capability.requirements.vcode && !permissions.allowVCode) {
    return false;
  }
  if (capability.requirements.password && !permissions.allowPassword) {
    return false;
  }
  return true;
}

function permissionMessage(
  capability: McpCapability,
  permissions: McpKeyPermissions,
): string {
  const missing: string[] = [];
  if (capability.requirements.vcode && !permissions.allowVCode) {
    missing.push("VCode");
  }
  if (capability.requirements.password && !permissions.allowPassword) {
    missing.push("密码");
  }

  return `当前 API Key 未开启${missing.join("和")}权限，无法调用 ${capability.name}`;
}

function toSummary(
  capability: McpCapability,
  permissions: McpKeyPermissions | null,
): McpCapabilitySummary {
  return {
    name: capability.name,
    title: capability.title,
    description: capability.description,
    category: capability.category,
    requirements: capability.requirements,
    annotations: capability.annotations,
    available: isCapabilityAvailable(capability, permissions),
  };
}

function toDetail(
  capability: McpCapability,
  permissions: McpKeyPermissions | null,
): McpCapabilityDetail {
  return {
    ...toSummary(capability, permissions),
    usage: capability.usage,
    returns: capability.returns,
    inputSchema: capability.inputSchema,
    examples: capability.examples,
  };
}

function matchesQuery(capability: McpCapability, query: string): boolean {
  const haystack = [
    capability.name,
    capability.title["zh-CN"],
    capability.title["en-US"],
    capability.description["zh-CN"],
    capability.description["en-US"],
    capability.category,
  ]
    .join(" ")
    .toLowerCase();

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export class McpController {
  private readonly capabilities = new Map<string, McpCapability>();

  register(capability: McpCapability) {
    if (this.capabilities.has(capability.name)) {
      throw new Error(`Duplicate MCP capability: ${capability.name}`);
    }
    this.capabilities.set(capability.name, capability);
  }

  registerAll(capabilities: McpCapability[]) {
    for (const capability of capabilities) this.register(capability);
  }

  list(
    permissions: McpKeyPermissions | null,
    options: McpSearchOptions = {},
  ): McpCapabilitySummary[] {
    const query = options.query?.trim() ?? "";

    return [...this.capabilities.values()]
      .filter((capability) => {
        if (options.category && capability.category !== options.category) {
          return false;
        }
        if (query && !matchesQuery(capability, query)) return false;
        if (
          options.availableOnly &&
          isCapabilityAvailable(capability, permissions) === false
        ) {
          return false;
        }
        return true;
      })
      .map((capability) => toSummary(capability, permissions))
      .sort(compareSummaries);
  }

  describe(
    name: string,
    permissions: McpKeyPermissions | null,
  ): McpCapabilityDetail | null {
    const capability = this.capabilities.get(name);
    return capability ? toDetail(capability, permissions) : null;
  }

  listTools(permissions: McpKeyPermissions): McpToolDefinition[] {
    return this.list(permissions, { availableOnly: true }).map(
      (summary) => {
        const capability = this.capabilities.get(summary.name);
        if (!capability) {
          throw new Error(`Missing MCP capability: ${summary.name}`);
        }

        return {
          name: capability.name,
          title: capability.title["en-US"],
          description: capability.description["en-US"],
          inputSchema: capability.inputSchema,
          annotations: capability.annotations,
          _meta: {
            "morfa/category": capability.category,
            "morfa/requiresVCode": capability.requirements.vcode,
            "morfa/requiresPassword": capability.requirements.password,
            "morfa/available": true,
          },
        };
      },
    );
  }

  async invoke(
    apiKey: ApiKeyRow,
    user: UserRow,
    origin: string,
    name: string,
    input: unknown,
  ): Promise<McpInvocation> {
    const capability = this.capabilities.get(name);
    if (!capability) {
      throw new ApiError(
        404,
        "MCP_CAPABILITY_NOT_FOUND",
        `MCP 能力 ${name} 不存在`,
      );
    }

    const permissions = permissionsFromKey(apiKey);
    if (isCapabilityAvailable(capability, permissions) === false) {
      throw new ApiError(
        403,
        "MCP_PERMISSION_DENIED",
        permissionMessage(capability, permissions),
      );
    }

    const args = validateArguments(capability.inputSchema, input);

    if (
      capability.requirements.vcode &&
      (typeof args.vcode !== "string" || args.vcode.length === 0)
    ) {
      throw new ApiError(
        400,
        "VCODE_REQUIRED",
        `${capability.name} 需要传入当前账号的 VCode`,
      );
    }

    if (
      capability.requirements.password &&
      (typeof args.password !== "string" || args.password.length === 0)
    ) {
      throw new ApiError(
        400,
        "PASSWORD_REQUIRED",
        `${capability.name} 需要传入当前账号密码`,
      );
    }

    const result = await capability.execute(
      { user, apiKey, origin },
      args,
    );

    if (isStructuredResult(result)) {
      return {
        name,
        data: result.structuredContent,
        ...(result.imageContent?.length
          ? { imageContent: result.imageContent }
          : {}),
      };
    }

    return { name, data: result };
  }
}
