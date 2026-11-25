import { ApiError } from "../../lib/errors.js";
import { avatarUrl } from "../../services/avatar.js";
import {
  updateAvatar,
  updateNickname,
} from "../../services/profile.js";
import {
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
  type McpCapability,
} from "../types.js";

const MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

function decodeAvatarInput(
  imageBase64: string,
  mimeType: string | undefined,
): { buffer: Buffer; mime: string } {
  const dataUri = imageBase64.match(
    /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s,
  );

  if (dataUri) {
    return {
      buffer: Buffer.from(dataUri[2], "base64"),
      mime: dataUri[1],
    };
  }

  if (!mimeType) {
    throw new ApiError(
      400,
      "AVATAR_TYPE",
      "请提供 mimeType，或使用 data URI 形式的图片",
    );
  }

  return {
    buffer: Buffer.from(imageBase64, "base64"),
    mime: mimeType,
  };
}

export function profileCapabilities(): McpCapability[] {
  return [
    {
      name: "update_nickname",
      title: {
        "zh-CN": "修改昵称",
        "en-US": "Update nickname",
      },
      description: {
        "zh-CN": "修改当前账号的昵称，长度 1–32 个字符。",
        "en-US":
          "Update the current account nickname. Length must be 1–32 characters.",
      },
      usage: {
        "zh-CN": "nickname 为新的昵称，前后空白会被去除。",
        "en-US":
          "nickname is the new nickname. Leading and trailing whitespace is trimmed.",
      },
      returns: {
        "zh-CN": "更新后的昵称。",
        "en-US": "The updated nickname.",
      },
      category: "profile",
      requirements: REQUIRE_NONE,
      annotations: { ...WRITE_ANNOTATIONS, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          nickname: {
            type: "string",
            description: "New nickname.",
            minLength: 1,
            maxLength: 32,
          },
        },
        required: ["nickname"],
        additionalProperties: false,
      },
      examples: [{ arguments: { nickname: "Morfa Designer" } }],
      async execute(context, args) {
        const updated = updateNickname(
          context.user,
          args.nickname as string,
        );
        return { nickname: updated.nickname };
      },
    },
    {
      name: "update_avatar",
      title: {
        "zh-CN": "修改头像",
        "en-US": "Update avatar",
      },
      description: {
        "zh-CN":
          "修改当前账号头像。接受 Base64 图片或 data URI，支持 PNG、JPG、WebP，最大 2 MB。",
        "en-US":
          "Update the current account avatar. Accepts Base64 image data or a data URI. PNG, JPG, and WebP up to 2 MB are supported.",
      },
      usage: {
        "zh-CN":
          "imageBase64 为图片 Base64；推荐直接传 data URI。mimeType 在传纯 Base64 时必填。",
        "en-US":
          "imageBase64 is Base64 image data; a data URI is recommended. mimeType is required for raw Base64.",
      },
      returns: {
        "zh-CN": "新的头像地址与 MIME 类型。",
        "en-US": "The new avatar URL and MIME type.",
      },
      category: "profile",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          imageBase64: {
            type: "string",
            description:
              "Base64 image data or a data:image/...;base64 URI.",
            minLength: 1,
            maxLength: 4_000_000,
          },
          mimeType: {
            type: "string",
            description: "Image MIME type for raw Base64 input.",
            enum: MIME_TYPES,
          },
        },
        required: ["imageBase64"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            imageBase64:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
          },
        },
      ],
      async execute(context, args) {
        const { buffer, mime } = decodeAvatarInput(
          args.imageBase64 as string,
          typeof args.mimeType === "string" ? args.mimeType : undefined,
        );

        const updated = await updateAvatar(context.user, buffer, mime);
        return {
          avatarUrl: new URL(
            avatarUrl(updated.avatar_path),
            context.origin,
          ).toString(),
          mimeType: mime,
        };
      },
    },
  ];
}
