import {
  createExportForUser,
  getExportSummary,
} from "../../services/dataTransfer.js";
import { verifyVCodeForUser } from "../../services/vcode.js";
import {
  READ_ONLY_ANNOTATIONS,
  WRITE_ANNOTATIONS,
  type McpCapability,
} from "../types.js";

export function dataCapabilities(): McpCapability[] {
  return [
    {
      name: "get_export_status",
      title: {
        "zh-CN": "获取导出包状态",
        "en-US": "Get export status",
      },
      description: {
        "zh-CN": "查询当前账号是否已有有效的加密导出包。",
        "en-US":
          "Check whether the current account has a valid encrypted export package.",
      },
      usage: {
        "zh-CN": "无需参数。",
        "en-US": "Takes no arguments.",
      },
      returns: {
        "zh-CN": "导出包概要；不存在时为 null。",
        "en-US": "Export summary, or null when no export exists.",
      },
      category: "data",
      requirements: { vcode: false, password: false },
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      examples: [{ arguments: {} }],
      async execute(context) {
        return { export: getExportSummary(context.user.id) };
      },
    },
    {
      name: "create_export",
      title: {
        "zh-CN": "创建加密导出包",
        "en-US": "Create encrypted export",
      },
      description: {
        "zh-CN":
          "校验 VCode 后创建新的加密导出包，并使旧导出包失效。",
        "en-US":
          "Verify a VCode and create a new encrypted export package, invalidating any previous export.",
      },
      usage: {
        "zh-CN":
          "必须传入当前账号的 6 位 VCode。API Key 需要开启 VCode 权限。返回的 downloadUrl 需要使用同一个 API Key 以 Bearer 方式下载。",
        "en-US":
          "Pass the account's 6-digit VCode. The API key must enable VCode permission. Download downloadUrl with the same API key as a Bearer token.",
      },
      returns: {
        "zh-CN": "导出包信息与下载地址。",
        "en-US": "Export details and a download URL.",
      },
      category: "data",
      requirements: { vcode: true, password: false },
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          vcode: {
            type: "string",
            description: "Current account 6-digit VCode.",
            minLength: 6,
            maxLength: 6,
          },
        },
        required: ["vcode"],
        additionalProperties: false,
      },
      examples: [{ arguments: { vcode: "123456" } }],
      async execute(context, args) {
        const { ticket } = await verifyVCodeForUser(
          context.user,
          args.vcode as string,
          "export",
        );
        const summary = await createExportForUser(context.user, ticket);

        return {
          export: summary,
          downloadUrl: `${context.origin}/api/mcp/export/latest`,
          downloadHint:
            "GET downloadUrl with Authorization: Bearer <the same Morfa API key>.",
        };
      },
    },
  ];
}
