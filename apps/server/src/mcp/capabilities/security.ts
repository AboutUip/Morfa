import { verifyVCodeForUser } from "../../services/vcode.js";
import {
  cancelAccount,
  changePassword,
} from "../../services/profile.js";
import {
  DESTRUCTIVE_ANNOTATIONS,
  WRITE_ANNOTATIONS,
  type McpCapability,
} from "../types.js";

export function securityCapabilities(): McpCapability[] {
  return [
    {
      name: "change_password",
      title: {
        "zh-CN": "修改密码",
        "en-US": "Change password",
      },
      description: {
        "zh-CN":
          "验证当前密码后修改账号密码，并吊销其他网页会话。",
        "en-US":
          "Verify the current password, change the account password, and revoke other web sessions.",
      },
      usage: {
        "zh-CN":
          "必须传入当前密码 password 与新密码 newPassword。API Key 必须开启密码权限。",
        "en-US":
          "Pass the current password as password and the new password as newPassword. The API key must enable password permission.",
      },
      returns: {
        "zh-CN": "修改结果与其他会话吊销状态。",
        "en-US":
          "Whether the password changed and other sessions were revoked.",
      },
      category: "security",
      requirements: { vcode: false, password: true },
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          password: {
            type: "string",
            description: "Current account password.",
            minLength: 1,
            maxLength: 128,
          },
          newPassword: {
            type: "string",
            description: "New account password.",
            minLength: 8,
            maxLength: 128,
          },
        },
        required: ["password", "newPassword"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            password: "current-password",
            newPassword: "new-password-123",
          },
        },
      ],
      async execute(context, args) {
        await changePassword(context.user, "", {
          currentPassword: args.password as string,
          newPassword: args.newPassword as string,
        });

        return {
          changed: true,
          otherSessionsRevoked: true,
        };
      },
    },
    {
      name: "cancel_account",
      title: {
        "zh-CN": "注销账号",
        "en-US": "Cancel account",
      },
      description: {
        "zh-CN":
          "校验当前密码与 VCode 后注销账号，吊销全部网页会话与 API Key。此操作不可撤销。",
        "en-US":
          "Cancel the account after verifying the current password and VCode. All web sessions and API keys are revoked. This cannot be undone.",
      },
      usage: {
        "zh-CN":
          "必须同时传入 password 与 6 位 vcode。API Key 必须同时开启密码和 VCode 权限。",
        "en-US":
          "Pass both password and a 6-digit vcode. The API key must enable both password and VCode permissions.",
      },
      returns: {
        "zh-CN": "注销结果。",
        "en-US": "The cancellation result.",
      },
      category: "security",
      requirements: { vcode: true, password: true },
      annotations: DESTRUCTIVE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          password: {
            type: "string",
            description: "Current account password.",
            minLength: 1,
            maxLength: 128,
          },
          vcode: {
            type: "string",
            description: "Current account 6-digit VCode.",
            minLength: 6,
            maxLength: 6,
          },
        },
        required: ["password", "vcode"],
        additionalProperties: false,
      },
      examples: [
        { arguments: { password: "current-password", vcode: "123456" } },
      ],
      async execute(context, args) {
        const { ticket } = await verifyVCodeForUser(
          context.user,
          args.vcode as string,
          "cancel",
        );

        await cancelAccount(context.user, {
          ticket,
          password: args.password as string,
        });

        return {
          cancelled: true,
          sessionsRevoked: true,
          apiKeysRevoked: true,
        };
      },
    },
  ];
}
