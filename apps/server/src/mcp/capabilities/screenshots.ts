import { insertScreenshotAudit, listScreenshotAudits } from "../../db/screenshotAudits.js";
import { ApiError } from "../../lib/errors.js";
import {
  captureCanvasScreenshot,
  captureNodeScreenshot,
  capturePageScreenshot,
} from "../../services/canvasScreenshot.js";
import {
  createScreenshotArtifact,
  getScreenshotArtifact,
} from "../../services/screenshotArtifacts.js";
import { assertScreenshotRateLimit } from "../../services/screenshotRateLimit.js";
import {
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  type McpCapability,
  type McpContext,
} from "../types.js";

const PROJECT_ID_SCHEMA = {
  type: "string" as const,
  description: "Morfa project id.",
  minLength: 1,
  maxLength: 120,
};

const PAGE_ID_SCHEMA = {
  type: "string" as const,
  description: "Page id.",
  minLength: 1,
  maxLength: 120,
};

interface ScreenshotMeta {
  projectId: string;
  mode: "page" | "node" | "canvas";
  pageId?: string;
  scale: number;
}

interface ScreenshotCaptureResult {
  data: string;
  mimeType: string;
  width: number;
  height: number;
  cacheHit: boolean;
}

function screenshotErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.code;
  return "SCREENSHOT_INTERNAL_ERROR";
}

async function runScreenshotCapture<T extends ScreenshotCaptureResult>(
  context: McpContext,
  meta: ScreenshotMeta,
  capture: () => Promise<T>,
): Promise<{
  structuredContent: Record<string, unknown>;
  imageContent: Array<{
    type: "image";
    data: string;
    mimeType: string;
  }>;
}> {
  const startedAt = Date.now();
  const actorId = context.apiKey.id;

  try {
    assertScreenshotRateLimit(actorId);
    const result = await capture();
    const { data, mimeType, cacheHit, ...structured } = result;
    const artifact = createScreenshotArtifact({
      userId: context.user.id,
      projectId: meta.projectId,
      mode: meta.mode,
      ...(meta.pageId ? { pageId: meta.pageId } : {}),
      scale: meta.scale,
      data,
      mimeType,
      width: result.width,
      height: result.height,
    });
    const bytes = Math.ceil((data.length * 3) / 4);
    const auditId = insertScreenshotAudit({
      userId: context.user.id,
      apiKeyId: actorId,
      projectId: meta.projectId,
      mode: meta.mode,
      ...(meta.pageId ? { pageId: meta.pageId } : {}),
      scale: meta.scale,
      cacheHit,
      status: "ok",
      bytes,
      durationMs: Date.now() - startedAt,
      artifactToken: artifact.token,
      now: Date.now(),
    });

    return {
      structuredContent: {
        ...(structured as Record<string, unknown>),
        projectId: meta.projectId,
        mode: meta.mode,
        ...(meta.pageId ? { pageId: meta.pageId } : {}),
        mimeType,
        cacheHit,
        url: `${context.origin}/api/screenshots/${artifact.token}`,
        expiresAt: artifact.expiresAt,
        auditId,
      },
      imageContent: [
        {
          type: "image",
          data,
          mimeType,
        },
      ],
    };
  } catch (error) {
    insertScreenshotAudit({
      userId: context.user.id,
      apiKeyId: actorId,
      projectId: meta.projectId,
      mode: meta.mode,
      ...(meta.pageId ? { pageId: meta.pageId } : {}),
      scale: meta.scale,
      cacheHit: false,
      status: "error",
      errorCode: screenshotErrorMessage(error),
      bytes: 0,
      durationMs: Date.now() - startedAt,
      now: Date.now(),
    });
    throw error;
  }
}

export function screenshotCapabilities(): McpCapability[] {
  return [
    {
      name: "capture_page",
      title: {
        "zh-CN": "截取页面截图",
        "en-US": "Capture page screenshot",
      },
      description: {
        "zh-CN":
          "生成页面及其子节点的 PNG 截图，并以 MCP image content 返回，Agent 可以直接看图。",
        "en-US":
          "Render a PNG screenshot of a page and its children and return it as MCP image content so agents can inspect the design.",
      },
      usage: {
        "zh-CN":
          "scale 支持 0.5-3。同一项目 revision 与 scale 会命中缓存；每个 API Key 每分钟最多 30 次。返回 5 分钟有效的短链接和 MCP image content。",
        "en-US":
          "scale supports 0.5-3. Identical project revisions and scales hit the cache; each API key allows 30 requests per minute. Returns a 5-minute short URL and MCP image content.",
      },
      returns: {
        "zh-CN":
          "页面名称、尺寸、缩放、updatedAt、cacheHit、短链接、过期时间、审计 id，以及 MCP image content。",
        "en-US":
          "Page name, dimensions, scale, updatedAt, cacheHit, short URL, expiry, audit id, and MCP image content.",
      },
      category: "screenshot",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          scale: {
            type: "number",
            description: "Screenshot scale from 0.5 to 3. Defaults to 1.",
            minimum: 0.5,
            maximum: 3,
          },
        },
        required: ["projectId", "pageId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            scale: 2,
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = args.pageId as string;
        const scale = typeof args.scale === "number" ? args.scale : 1;
        return runScreenshotCapture(
          context,
          { projectId, mode: "page", pageId, scale },
          () =>
            capturePageScreenshot(
              context.user.id,
              projectId,
              pageId,
              scale,
            ),
        );
      },
    },
    {
      name: "capture_canvas",
      title: {
        "zh-CN": "截取整张画布",
        "en-US": "Capture canvas",
      },
      description: {
        "zh-CN":
          "按世界坐标渲染全部顶层页面及其子树，带背景与留白生成 PNG，并以 MCP image content 返回。",
        "en-US":
          "Render every top-level page and its descendants at world coordinates with background and padding, then return a PNG as MCP image content.",
      },
      usage: {
        "zh-CN":
          "scale 支持 0.5-3。使用共享布局解析器计算 frame；画布过大时返回 413。结果按 revision 缓存，并返回 5 分钟短链接与审计 id。",
        "en-US":
          "scale supports 0.5-3. Frames come from the shared layout resolver; an oversized canvas returns 413. Results are cached per revision and include a 5-minute short URL and audit id.",
      },
      returns: {
        "zh-CN":
          "画布尺寸、缩放、updatedAt、页面/节点数量、边界、cacheHit、短链接与 MCP image content。",
        "en-US":
          "Canvas dimensions, scale, updatedAt, page/node counts, bounds, cacheHit, short URL, and MCP image content.",
      },
      category: "screenshot",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          scale: {
            type: "number",
            description:
              "Screenshot scale from 0.5 to 3. Defaults to 1.",
            minimum: 0.5,
            maximum: 3,
          },
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            scale: 1,
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const scale = typeof args.scale === "number" ? args.scale : 1;
        return runScreenshotCapture(
          context,
          { projectId, mode: "canvas", scale },
          () =>
            captureCanvasScreenshot(
              context.user.id,
              projectId,
              scale,
            ),
        );
      },
    },
    {
      name: "capture_node",
      title: {
        "zh-CN": "截取节点截图",
        "en-US": "Capture node",
      },
      description: {
        "zh-CN":
          "以页面本地坐标渲染指定节点及其子树，生成 PNG 并以 MCP image content 返回。节点可以是任意层级。",
        "en-US":
          "Render a node and its descendants in page-local coordinates and return a PNG as MCP image content. The node can be at any depth.",
      },
      usage: {
        "zh-CN":
          "传入 projectId、nodeId；scale 支持 0.5-3。使用共享布局解析器的 frame 计算尺寸与子节点位置。结果按 revision/scale 缓存，并返回 5 分钟短链接与审计 id。",
        "en-US":
          "Pass projectId and nodeId; scale supports 0.5-3. The shared resolver provides the frame size and child positions. Results are cached by revision/scale and include a 5-minute short URL and audit id.",
      },
      returns: {
        "zh-CN":
          "节点名称、尺寸、缩放、updatedAt、cacheHit、短链接与 MCP image content。",
        "en-US":
          "Node name, dimensions, scale, updatedAt, cacheHit, short URL, and MCP image content.",
      },
      category: "screenshot",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          nodeId: PAGE_ID_SCHEMA,
          scale: {
            type: "number",
            description:
              "Screenshot scale from 0.5 to 3. Defaults to 1.",
            minimum: 0.5,
            maximum: 3,
          },
        },
        required: ["projectId", "nodeId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            nodeId: "n1a2b3c4",
            scale: 1,
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const nodeId = args.nodeId as string;
        const scale = typeof args.scale === "number" ? args.scale : 1;
        return runScreenshotCapture(
          context,
          { projectId, mode: "node", pageId: nodeId, scale },
          () =>
            captureNodeScreenshot(
              context.user.id,
              projectId,
              nodeId,
              scale,
            ),
        );
      },
    },
    {
      name: "list_screenshot_audits",
      title: {
        "zh-CN": "列出截图审计",
        "en-US": "List screenshot audits",
      },
      description: {
        "zh-CN":
          "读取当前账号最近的截图审计记录，包括缓存命中、耗时、状态、错误码与短期链接。",
        "en-US":
          "List recent screenshot audit records for the current account, including cache hits, duration, status, error code, and short-lived links.",
      },
      usage: {
        "zh-CN":
          "可选 projectId 过滤；limit 为 1-50，默认 20。截图链接最多保留 5 分钟。",
        "en-US":
          "Optional projectId filter; limit is 1-50 and defaults to 20. Screenshot links live for at most 5 minutes.",
      },
      returns: {
        "zh-CN": "截图审计记录、数量与服务器时间。",
        "en-US":
          "Screenshot audit records, count, and server time.",
      },
      category: "screenshot",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: {
            ...PROJECT_ID_SCHEMA,
            description: "Optional project id filter.",
          },
          limit: {
            type: "number",
            description:
              "Maximum audit rows from 1 to 50. Defaults to 20.",
            minimum: 1,
            maximum: 50,
          },
        },
        additionalProperties: false,
      },
      examples: [
        { arguments: { projectId: "project-uuid", limit: 10 } },
        { arguments: {} },
      ],
      async execute(context, args) {
        const projectId =
          typeof args.projectId === "string" && args.projectId.trim()
            ? args.projectId.trim()
            : undefined;
        const limit =
          typeof args.limit === "number" && Number.isFinite(args.limit)
            ? Math.min(50, Math.max(1, Math.round(args.limit)))
            : 20;
        const rows = listScreenshotAudits({
          userId: context.user.id,
          ...(projectId ? { projectId } : {}),
          limit,
        });
        const audits = rows.map((row) => {
          const artifact = row.artifact_token
            ? getScreenshotArtifact(row.artifact_token)
            : null;
          return {
            id: row.id,
            projectId: row.project_id,
            mode: row.mode,
            ...(row.page_id ? { pageId: row.page_id } : {}),
            scale: row.scale,
            cacheHit: row.cache_hit === 1,
            status: row.status,
            ...(row.error_code ? { errorCode: row.error_code } : {}),
            bytes: row.bytes,
            durationMs: row.duration_ms,
            ...(artifact?.status === "ok"
              ? {
                  url: `${context.origin}/api/screenshots/${artifact.artifact.token}`,
                  expiresAt: artifact.artifact.expiresAt,
                }
              : {}),
            createdAt: row.created_at,
          };
        });
        return {
          count: audits.length,
          audits,
          serverTime: Date.now(),
        };
      },
    },
  ];
}
