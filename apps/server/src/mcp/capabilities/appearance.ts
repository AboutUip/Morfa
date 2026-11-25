import { updateUserPreferences } from "../../services/preferences.js";
import {
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
  type McpCapability,
} from "../types.js";

export function appearanceCapabilities(): McpCapability[] {
  return [
    {
      name: "set_language",
      title: {
        "zh-CN": "设置界面语言",
        "en-US": "Set interface language",
      },
      description: {
        "zh-CN":
          "修改当前账号的界面语言。下次打开或同步 Morfa 时生效。",
        "en-US":
          "Change the interface language for the current account. Applied when Morfa next loads or syncs.",
      },
      usage: {
        "zh-CN": "locale 仅支持 zh-CN 与 en-US。",
        "en-US": "locale accepts zh-CN or en-US.",
      },
      returns: {
        "zh-CN": "更新后的偏好设置。",
        "en-US": "The updated preferences.",
      },
      category: "appearance",
      requirements: REQUIRE_NONE,
      annotations: { ...WRITE_ANNOTATIONS, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          locale: {
            type: "string",
            description: "Interface locale.",
            enum: ["zh-CN", "en-US"],
          },
        },
        required: ["locale"],
        additionalProperties: false,
      },
      examples: [{ arguments: { locale: "en-US" } }],
      async execute(context, args) {
        return {
          preferences: updateUserPreferences(context.user.id, {
            locale: args.locale,
          }),
        };
      },
    },
    {
      name: "set_theme",
      title: {
        "zh-CN": "设置主题",
        "en-US": "Set theme",
      },
      description: {
        "zh-CN":
          "修改当前账号的界面主题，支持跟随系统、浅色与深色。",
        "en-US":
          "Change the interface theme for the current account: system, light, or dark.",
      },
      usage: {
        "zh-CN": "theme 支持 system、light、dark。",
        "en-US": "theme accepts system, light, or dark.",
      },
      returns: {
        "zh-CN": "更新后的偏好设置。",
        "en-US": "The updated preferences.",
      },
      category: "appearance",
      requirements: REQUIRE_NONE,
      annotations: { ...WRITE_ANNOTATIONS, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          theme: {
            type: "string",
            description: "Theme mode.",
            enum: ["system", "light", "dark"],
          },
        },
        required: ["theme"],
        additionalProperties: false,
      },
      examples: [{ arguments: { theme: "dark" } }],
      async execute(context, args) {
        return {
          preferences: updateUserPreferences(context.user.id, {
            themeMode: args.theme,
          }),
        };
      },
    },
  ];
}
