import {
  captureCanvasScreenshot,
  captureNodeScreenshot,
  capturePageScreenshot,
} from "../../services/canvasScreenshot.js";
import {
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  type McpCapability,
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
          "scale 支持 0.5-3。截图使用 Chrome/Chromium，可通过 CHROME_PATH 指定浏览器路径。",
        "en-US":
          "scale supports 0.5-3. Screenshots use Chrome/Chromium; set CHROME_PATH when needed.",
      },
      returns: {
        "zh-CN":
          "页面名称、尺寸、缩放、updatedAt，以及 MCP image content。",
        "en-US":
          "Page name, dimensions, scale, updatedAt, and MCP image content.",
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
        const result = await capturePageScreenshot(
          context.user.id,
          args.projectId as string,
          args.pageId as string,
          typeof args.scale === "number" ? args.scale : 1,
        );
        const { data, ...meta } = result;
        return {
          structuredContent: meta,
          imageContent: [
            {
              type: "image",
              data,
              mimeType: result.mimeType,
            },
          ],
        };
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
          "scale 支持 0.5-3。使用共享布局解析器计算 frame；画布过大时返回 413。",
        "en-US":
          "scale supports 0.5-3. Frames come from the shared layout resolver; an oversized canvas returns 413.",
      },
      returns: {
        "zh-CN":
          "画布尺寸、缩放、updatedAt、页面/节点数量、边界与 MCP image content。",
        "en-US":
          "Canvas dimensions, scale, updatedAt, page/node counts, bounds, and MCP image content.",
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
        const result = await captureCanvasScreenshot(
          context.user.id,
          args.projectId as string,
          typeof args.scale === "number" ? args.scale : 1,
        );
        const { data, ...meta } = result;
        return {
          structuredContent: meta,
          imageContent: [
            {
              type: "image",
              data,
              mimeType: result.mimeType,
            },
          ],
        };
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
          "传入 projectId、nodeId；scale 支持 0.5-3。使用共享布局解析器的 frame 计算尺寸与子节点位置。",
        "en-US":
          "Pass projectId and nodeId; scale supports 0.5-3. The shared resolver provides the frame size and child positions.",
      },
      returns: {
        "zh-CN":
          "节点名称、尺寸、缩放、updatedAt 与 MCP image content。",
        "en-US":
          "Node name, dimensions, scale, updatedAt, and MCP image content.",
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
        const result = await captureNodeScreenshot(
          context.user.id,
          args.projectId as string,
          args.nodeId as string,
          typeof args.scale === "number" ? args.scale : 1,
        );
        const { data, ...meta } = result;
        return {
          structuredContent: meta,
          imageContent: [
            {
              type: "image",
              data,
              mimeType: result.mimeType,
            },
          ],
        };
      },
    },
  ];
}
