import {
  createProjectAsset,
  deleteProjectAsset,
  listProjectAssets,
  type ProjectAssetDto,
} from "../../services/projectAssets.js";
import {
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
  type McpCapability,
} from "../types.js";

const PROJECT_ID_SCHEMA = {
  type: "string" as const,
  description: "Morfa project id.",
  minLength: 1,
  maxLength: 120,
};

const ASSET_ID_SCHEMA = {
  type: "string" as const,
  description: "Project asset id.",
  minLength: 1,
  maxLength: 120,
};

function withAbsoluteUrl(
  asset: ProjectAssetDto,
  origin: string,
): ProjectAssetDto & { url: string } {
  return {
    ...asset,
    url: `${origin.replace(/\/+$/, "")}${asset.path}`,
  };
}

export function assetCapabilities(): McpCapability[] {
  return [
    {
      name: "upload_asset",
      title: {
        "zh-CN": "上传素材",
        "en-US": "Upload asset",
      },
      description: {
        "zh-CN":
          "将一张图片作为项目素材上传到 Morfa，支持 PNG、JPG、WebP、GIF，最大 4 MB。上传后返回可直接访问的绝对 URL。",
        "en-US":
          "Upload an image as a project asset. Supports PNG, JPG, WebP, and GIF up to 4 MB, and returns the asset with an absolute URL.",
      },
      usage: {
        "zh-CN":
          "dataUrl 必须是 data:image/png;base64,... 形式的 base64 data URL；name 可选，最长 160 个字符。不支持 SVG。",
        "en-US":
          "dataUrl must be a base64 data URL such as data:image/png;base64,...; name is optional and capped at 160 characters. SVG is not supported.",
      },
      returns: {
        "zh-CN":
          "素材 DTO（id、name、mimeType、size、path、createdAt）以及绝对 URL。",
        "en-US":
          "The asset DTO (id, name, mimeType, size, path, createdAt) plus an absolute url.",
      },
      category: "assets",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          name: {
            type: "string",
            description:
              "Optional display name. Sanitized and capped at 160 characters.",
            maxLength: 160,
          },
          dataUrl: {
            type: "string",
            description:
              "Base64 data URL (PNG/JPEG/WebP/GIF), e.g. data:image/png;base64,...",
            minLength: 1,
            maxLength: 6_000_000,
          },
        },
        required: ["projectId", "dataUrl"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            name: "hero-banner.png",
            dataUrl:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...",
          },
        },
      ],
      async execute(context, args) {
        const asset = await createProjectAsset(
          context.user.id,
          String(args.projectId ?? ""),
          {
            ...(typeof args.name === "string" ? { name: args.name } : {}),
            dataUrl: String(args.dataUrl ?? ""),
          },
        );
        return { asset: withAbsoluteUrl(asset, context.origin) };
      },
    },
    {
      name: "list_assets",
      title: {
        "zh-CN": "列出项目素材",
        "en-US": "List project assets",
      },
      description: {
        "zh-CN":
          "列出指定项目上传的图片素材，按上传时间从新到旧排列，并返回带绝对 URL 的访问地址。",
        "en-US":
          "List uploaded image assets for a project, newest first, with absolute access URLs.",
      },
      usage: {
        "zh-CN": "传入 projectId。只能访问自己拥有或已加入的项目。",
        "en-US":
          "Pass projectId. Only owned or joined projects are accessible.",
      },
      returns: {
        "zh-CN": "素材数量与素材数组，每个素材包含 path 和绝对 url。",
        "en-US":
          "The asset count and asset array with path and absolute url for each asset.",
      },
      category: "assets",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [{ arguments: { projectId: "project-uuid" } }],
      async execute(context, args) {
        const assets = listProjectAssets(
          context.user.id,
          String(args.projectId ?? ""),
        ).map((asset) => withAbsoluteUrl(asset, context.origin));
        return { count: assets.length, assets };
      },
    },
    {
      name: "delete_asset",
      title: {
        "zh-CN": "删除项目素材",
        "en-US": "Delete project asset",
      },
      description: {
        "zh-CN":
          "永久删除项目中的一张素材图片及其存储文件，操作不可撤销。",
        "en-US":
          "Permanently delete a project asset and its stored file. This cannot be undone.",
      },
      usage: {
        "zh-CN":
          "传入 projectId 与 assetId。素材不存在或不属于该项目时返回 404。",
        "en-US":
          "Pass projectId and assetId. Missing assets or assets from another project return 404.",
      },
      returns: {
        "zh-CN": "被删除的素材 id 与 deleted=true。",
        "en-US": "The deleted asset id and deleted=true.",
      },
      category: "assets",
      requirements: REQUIRE_NONE,
      annotations: DESTRUCTIVE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          assetId: ASSET_ID_SCHEMA,
        },
        required: ["projectId", "assetId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            assetId: "asset-uuid",
          },
        },
      ],
      async execute(context, args) {
        return deleteProjectAsset(
          context.user.id,
          String(args.projectId ?? ""),
          String(args.assetId ?? ""),
        );
      },
    },
  ];
}
