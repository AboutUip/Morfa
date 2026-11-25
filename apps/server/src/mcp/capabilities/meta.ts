import { avatarUrl } from "../../services/avatar.js";
import type { McpController } from "../controller.js";
import { permissionsFromKey } from "../controller.js";
import { ApiError } from "../../lib/errors.js";
import {
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  type McpCategory,
} from "../types.js";

const CATEGORIES: McpCategory[] = [
  "system",
  "appearance",
  "profile",
  "security",
  "data",
  "models",
];

export function registerMetaCapabilities(controller: McpController) {
  controller.register({
    name: "get_mcp_status",
    title: {
      "zh-CN": "获取 MCP 状态",
      "en-US": "Get MCP status",
    },
    description: {
      "zh-CN":
        "返回当前账号、API Key、权限开关、MCP 端点以及可用能力统计。",
      "en-US":
        "Return the current account, API key, permissions, MCP endpoint, and capability statistics.",
    },
    usage: {
      "zh-CN":
        "无需参数。适合在开始操作前确认当前 API Key 能调用哪些能力。",
      "en-US":
        "Takes no arguments. Use it before acting to see which capabilities the current API key can call.",
    },
    returns: {
      "zh-CN":
        "账号概要、API Key 名称与权限、MCP 端点、llms.txt 地址、能力总数与可用能力列表。",
      "en-US":
        "Account summary, API key name and permissions, MCP endpoint, llms.txt URL, total and available capabilities.",
    },
    category: "system",
    requirements: REQUIRE_NONE,
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    examples: [{ arguments: {} }],
    async execute(context) {
      const permissions = permissionsFromKey(context.apiKey);
      const all = controller.list(permissions);
      const available = all.filter((capability) => capability.available);

      return {
        account: {
          id: context.user.id,
          nickname: context.user.nickname,
          loginAccount: context.user.login_account,
          avatarUrl: new URL(
            avatarUrl(context.user.avatar_path),
            context.origin,
          ).toString(),
        },
        apiKey: {
          id: context.apiKey.id,
          name: context.apiKey.name,
          prefix: context.apiKey.token_prefix,
          allowVCode: permissions.allowVCode,
          allowPassword: permissions.allowPassword,
        },
        endpoint: `${context.origin}/mcp`,
        llmsTxtUrl: `${context.origin}/llms.txt`,
        capabilities: {
          total: all.length,
          available: available.length,
          availableNames: available.map((capability) => capability.name),
          lockedNames: all
            .filter((capability) => capability.available === false)
            .map((capability) => capability.name),
        },
      };
    },
  });

  controller.register({
    name: "search_mcp_capabilities",
    title: {
      "zh-CN": "搜索 MCP 能力",
      "en-US": "Search MCP capabilities",
    },
    description: {
      "zh-CN":
        "按关键词或分类搜索 MCP 能力，并返回每项能力所需的 VCode / 密码权限。",
      "en-US":
        "Search MCP capabilities by keyword or category, including required VCode and password permissions.",
    },
    usage: {
      "zh-CN":
        "query 可匹配能力名称、标题、描述与分类；不传 query 会返回全部能力。availableOnly 可只保留当前 API Key 可调用的能力。",
      "en-US":
        "query matches capability names, titles, descriptions, and categories. Omit it to list everything. Set availableOnly to keep only capabilities callable by this API key.",
    },
    returns: {
      "zh-CN": "能力摘要列表，包含分类、权限要求与当前是否可用。",
      "en-US":
        "A list of capability summaries with category, permission requirements, and availability.",
    },
    category: "system",
    requirements: REQUIRE_NONE,
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keyword.",
          maxLength: 120,
        },
        category: {
          type: "string",
          description: "Capability category.",
          enum: CATEGORIES,
        },
        availableOnly: {
          type: "boolean",
          description:
            "Only include capabilities callable by the current API key.",
        },
      },
      additionalProperties: false,
    },
    examples: [
      { arguments: { query: "model" } },
      { arguments: { category: "security" } },
    ],
    async execute(context, args) {
      const permissions = permissionsFromKey(context.apiKey);
      const capabilities = controller.list(permissions, {
        query: typeof args.query === "string" ? args.query : undefined,
        category:
          typeof args.category === "string"
            ? (args.category as McpCategory)
            : undefined,
        availableOnly: args.availableOnly === true,
      });

      return {
        count: capabilities.length,
        capabilities,
      };
    },
  });

  controller.register({
    name: "get_mcp_capability",
    title: {
      "zh-CN": "获取 MCP 能力详情",
      "en-US": "Get MCP capability details",
    },
    description: {
      "zh-CN":
        "获取某个 MCP 能力的详细用法、输入 schema、参数示例、权限要求与返回说明。",
      "en-US":
        "Get detailed usage, input schema, examples, permission requirements, and return information for one MCP capability.",
    },
    usage: {
      "zh-CN":
        "传入能力名称（例如 create_export 或 test_model）。建议在调用不熟悉的能力前先查询。",
      "en-US":
        "Pass the capability name, such as create_export or test_model. Use it before calling an unfamiliar capability.",
    },
    returns: {
      "zh-CN": "能力完整定义，包括当前 API Key 下是否可用。",
      "en-US":
        "The full capability definition, including availability for the current API key.",
    },
    category: "system",
    requirements: REQUIRE_NONE,
    annotations: READ_ONLY_ANNOTATIONS,
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Capability name.",
          minLength: 1,
          maxLength: 120,
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    examples: [{ arguments: { name: "create_export" } }],
    async execute(context, args) {
      const detail = controller.describe(
        args.name as string,
        permissionsFromKey(context.apiKey),
      );

      if (!detail) {
        throw new ApiError(
          404,
          "MCP_CAPABILITY_NOT_FOUND",
          `MCP 能力 ${String(args.name)} 不存在`,
        );
      }

      return { capability: detail };
    },
  });
}
