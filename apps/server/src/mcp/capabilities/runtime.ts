import type { CanvasResolvedFrame } from "@morfa/shared/canvas-layout";

import { ApiError } from "../../lib/errors.js";
import {
  getProjectCanvas,
  type CanvasDocumentDto,
  type CanvasLinkDto,
  type CanvasPageDto,
} from "../../services/canvasDocuments.js";
import { resolvePageFrames } from "../../services/canvasFrames.js";
import {
  lintCanvas,
  type CanvasLintItem,
  type CanvasLintSummary,
} from "../../services/canvasLint.js";
import { capturePageScreenshot } from "../../services/canvasScreenshot.js";
import {
  EXPECTED_UPDATED_AT_SCHEMA,
  PAGE_ID_SCHEMA,
  PROJECT_ID_SCHEMA,
  findPage,
  loadCanvasForWrite,
  pageSize,
  readExpectedUpdatedAt,
  readPageIdArgument,
} from "./canvasSupport.js";
import {
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  type McpCapability,
  type McpContext,
} from "../types.js";

const MAX_PREVIEW_STATES = 200;

type RuntimeEntryStrategy = "container" | "direct" | "ambiguous";

interface RuntimeEntry {
  strategy: RuntimeEntryStrategy;
  entryPageId: string | null;
  candidates: string[];
}

interface RuntimeScreen {
  id: string;
  name: string;
  frame: CanvasPageDto["frame"] | null;
  size: { width: number; height: number };
  direct: boolean;
  linkIds: string[];
  resolvedFrame: CanvasResolvedFrame | null;
}

interface RuntimeScreens {
  container: {
    id: string;
    name: string;
    frame: CanvasPageDto["frame"] | null;
    size: { width: number; height: number };
    resolvedFrame: CanvasResolvedFrame | null;
  };
  screens: RuntimeScreen[];
  entry: RuntimeEntry;
  missingTargets: string[];
}

interface PreviewSnapshot {
  containerId: string;
  entryPageId: string;
  pages: CanvasPageDto[];
  links: CanvasLinkDto[];
  compiledAt: number;
  updatedAt: number;
}

interface StoredPreview {
  snapshot: PreviewSnapshot;
  warnings: CanvasLintItem[];
  lintSummary: CanvasLintSummary;
  entry: RuntimeEntry;
}

const previewStore = new Map<string, StoredPreview>();

function previewKey(
  userId: string,
  projectId: string,
  containerId: string,
) {
  return `${userId}:${projectId}:${containerId}`;
}

function storePreview(key: string, state: StoredPreview) {
  previewStore.delete(key);
  previewStore.set(key, state);
  while (previewStore.size > MAX_PREVIEW_STATES) {
    const oldest = previewStore.keys().next().value;
    if (!oldest) break;
    previewStore.delete(oldest);
  }
}

function screenFromPage(
  page: CanvasPageDto,
  frames: Map<string, CanvasResolvedFrame>,
  linkIds: string[],
): RuntimeScreen {
  const frame = frames.get(page.id) ?? null;
  return {
    id: page.id,
    name: page.name,
    frame: page.frame ?? null,
    size: pageSize(frame),
    direct: true,
    linkIds,
    resolvedFrame: frame,
  };
}

function resolveRuntimeScreens(
  document: CanvasDocumentDto,
  containerId: string,
): RuntimeScreens {
  const container = findPage(document, containerId);
  const frames = resolvePageFrames(document.pages, document.links);
  const pagesById = new Map(
    document.pages.map((page) => [page.id, page]),
  );
  const linkIdsByTarget = new Map<string, string[]>();
  const missingTargets: string[] = [];

  for (const link of document.links) {
    let targetId: string | null = null;
    if (link.fromId === containerId) {
      targetId = link.toId;
    } else if (
      link.direction === "two-way" &&
      link.toId === containerId
    ) {
      targetId = link.fromId;
    }
    if (!targetId || targetId === containerId) continue;
    if (!pagesById.has(targetId)) {
      missingTargets.push(link.id);
      continue;
    }
    const list = linkIdsByTarget.get(targetId);
    if (list) list.push(link.id);
    else linkIdsByTarget.set(targetId, [link.id]);
  }

  const screens = [...linkIdsByTarget.entries()].map(
    ([targetId, linkIds]) => {
      const page = pagesById.get(targetId) as CanvasPageDto;
      return screenFromPage(page, frames, linkIds);
    },
  );

  let entry: RuntimeEntry;
  if (screens.length === 0) {
    entry = {
      strategy: "container",
      entryPageId: containerId,
      candidates: [],
    };
  } else if (screens.length === 1) {
    entry = {
      strategy: "direct",
      entryPageId: screens[0].id,
      candidates: [screens[0].id],
    };
  } else {
    entry = {
      strategy: "ambiguous",
      entryPageId: null,
      candidates: screens.map((screen) => screen.id),
    };
  }

  const containerFrame = frames.get(containerId) ?? null;
  return {
    container: {
      id: container.id,
      name: container.name,
      frame: container.frame ?? null,
      size: pageSize(containerFrame),
      resolvedFrame: containerFrame,
    },
    screens,
    entry,
    missingTargets,
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function compileFailureMessage(errors: CanvasLintItem[]) {
  const details = errors
    .slice(0, 5)
    .map((item) => item.message)
    .join("；");
  const suffix = errors.length > 5 ? "；…" : "";
  return `预览编译失败：${errors.length} 个错误。${details}${suffix}`;
}

function compilePreviewInternal(
  context: McpContext,
  projectId: string,
  containerId: string,
  requestedEntryPageId: unknown,
  expectedUpdatedAt: number | undefined,
) {
  const document = loadCanvasForWrite(
    context.user.id,
    projectId,
    expectedUpdatedAt,
  );
  const container = findPage(document, containerId);
  const runtimeScreens = resolveRuntimeScreens(
    document,
    containerId,
  );

  let entryPageId: string;
  if (requestedEntryPageId !== undefined) {
    const requested = readPageIdArgument(
      requestedEntryPageId,
      "entryPageId",
    );
    const isContainer = requested === containerId;
    const isDirect = runtimeScreens.screens.some(
      (screen) => screen.id === requested,
    );
    if (!isContainer && !isDirect) {
      throw new ApiError(
        400,
        "PREVIEW_COMPILE_FAILED",
        `入口页面 ${requested} 既不是容器 ${container.name}，也不是其直接关联屏幕`,
      );
    }
    entryPageId = requested;
  } else if (runtimeScreens.entry.entryPageId) {
    entryPageId = runtimeScreens.entry.entryPageId;
  } else {
    throw new ApiError(
      400,
      "PREVIEW_COMPILE_FAILED",
      `容器 ${container.name} 存在 ${runtimeScreens.entry.candidates.length} 个直接关联屏幕，请传入 entryPageId 指定预览入口`,
    );
  }

  const lint = lintCanvas(document);
  if (lint.errors.length) {
    throw new ApiError(
      400,
      "PREVIEW_COMPILE_FAILED",
      compileFailureMessage(lint.errors),
    );
  }

  const snapshot: PreviewSnapshot = {
    containerId,
    entryPageId,
    pages: cloneJson(document.pages),
    links: cloneJson(document.links),
    compiledAt: Date.now(),
    updatedAt: document.updatedAt,
  };

  const entry: RuntimeEntry = {
    strategy:
      entryPageId === containerId ? "container" : "direct",
    entryPageId,
    candidates:
      runtimeScreens.entry.candidates.length > 0
        ? runtimeScreens.entry.candidates
        : entryPageId === containerId
          ? []
          : [entryPageId],
  };

  storePreview(previewKey(context.user.id, projectId, containerId), {
    snapshot,
    warnings: lint.warnings,
    lintSummary: lint.summary,
    entry,
  });

  return {
    document,
    container,
    runtimeScreens,
    snapshot,
    lint,
    entry,
  };
}

export function runtimeCapabilities(): McpCapability[] {
  return [
    {
      name: "get_runtime_screens",
      title: {
        "zh-CN": "获取运行时屏幕",
        "en-US": "Get runtime screens",
      },
      description: {
        "zh-CN":
          "读取容器页面通过关联线直达的屏幕，并计算运行时入口策略：无直连屏幕时入口为容器自身，唯一屏幕自动成为入口，多个屏幕时返回候选。",
        "en-US":
          "Read screens directly linked from a container and compute entry strategy: the container itself when there are none, the only screen when there is one, or candidates when ambiguous.",
      },
      usage: {
        "zh-CN":
          "传入 projectId 与 containerId。双向关联线的反向边也视为直连；只计算从容器出发或双向反向的边。",
        "en-US":
          "Pass projectId and containerId. Two-way links count in the reverse direction; only edges out of the container or reverse two-way edges are considered.",
      },
      returns: {
        "zh-CN":
          "container、screens（id/name/frame/size/direct/linkIds）、entry 策略、updatedAt 与数量。",
        "en-US":
          "container, screens (id/name/frame/size/direct/linkIds), entry strategy, updatedAt, and counts.",
      },
      category: "runtime",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          containerId: PAGE_ID_SCHEMA,
        },
        required: ["projectId", "containerId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            containerId: "n1a2b3c4",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const containerId = readPageIdArgument(
          args.containerId,
          "containerId",
        );
        const document = getProjectCanvas(
          context.user.id,
          projectId,
        );
        const runtimeScreens = resolveRuntimeScreens(
          document,
          containerId,
        );

        return {
          projectId,
          updatedAt: document.updatedAt,
          container: runtimeScreens.container,
          screens: runtimeScreens.screens,
          entry: runtimeScreens.entry,
          ...(runtimeScreens.missingTargets.length
            ? {
                warnings: [
                  `${runtimeScreens.missingTargets.length} 条关联线指向不存在的页面`,
                ],
                missingTargetLinkIds: runtimeScreens.missingTargets,
              }
            : {}),
          counts: {
            screens: runtimeScreens.screens.length,
            candidates: runtimeScreens.entry.candidates.length,
          },
        };
      },
    },
    {
      name: "compile_preview",
      title: {
        "zh-CN": "编译预览快照",
        "en-US": "Compile preview",
      },
      description: {
        "zh-CN":
          "在内存中校验容器与入口页面，生成运行时预览快照并缓存为最近一次编译结果；不会写入或修改画布。",
        "en-US":
          "Validate a container and entry page, build an in-memory runtime preview snapshot, and cache it as the latest compilation without modifying the canvas.",
      },
      usage: {
        "zh-CN":
          "传入 projectId、containerId；entryPageId 必须是容器本身或其直接关联屏幕。容器存在多个直连屏幕时必须指定入口。expectedUpdatedAt 可选：与当前 updatedAt 不一致时返回 409。编译错误返回 400 PREVIEW_COMPILE_FAILED。",
        "en-US":
          "Pass projectId and containerId. entryPageId must be the container itself or one of its direct screens; when multiple direct screens exist, it is required. expectedUpdatedAt is optional and returns 409 on mismatch. Compile errors return 400 PREVIEW_COMPILE_FAILED.",
      },
      returns: {
        "zh-CN":
          "snapshot（containerId/entryPageId/pages/links/compiledAt/updatedAt）、warnings、lintSummary、entry 候选与 container/screens。",
        "en-US":
          "snapshot (containerId/entryPageId/pages/links/compiledAt/updatedAt), warnings, lintSummary, entry candidates, container, and screens.",
      },
      category: "runtime",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          containerId: PAGE_ID_SCHEMA,
          entryPageId: PAGE_ID_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "containerId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            containerId: "n1a2b3c4",
          },
        },
        {
          arguments: {
            projectId: "project-uuid",
            containerId: "n1a2b3c4",
            entryPageId: "n5d6e7f8",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const containerId = readPageIdArgument(
          args.containerId,
          "containerId",
        );
        const compiled = compilePreviewInternal(
          context,
          projectId,
          containerId,
          args.entryPageId,
          readExpectedUpdatedAt(args),
        );

        return {
          projectId,
          containerId,
          container: compiled.runtimeScreens.container,
          snapshot: compiled.snapshot,
          warnings: compiled.lint.warnings,
          lintSummary: compiled.lint.summary,
          entry: compiled.entry,
          entryCandidates: compiled.runtimeScreens.entry.candidates,
          screens: compiled.runtimeScreens.screens,
          counts: {
            pages: compiled.snapshot.pages.length,
            links: compiled.snapshot.links.length,
            screens: compiled.runtimeScreens.screens.length,
          },
        };
      },
    },
    {
      name: "get_preview_status",
      title: {
        "zh-CN": "获取预览状态",
        "en-US": "Get preview status",
      },
      description: {
        "zh-CN":
          "返回容器最近一次编译快照的元数据、当前画布 updatedAt，以及画布是否在编译后发生变化（dirty）。",
        "en-US":
          "Return the latest compiled snapshot metadata for a container, the current canvas updatedAt, and whether the canvas changed after compilation (dirty).",
      },
      usage: {
        "zh-CN":
          "传入 projectId 与 containerId。从未编译过时 lastCompiled 为 null，dirty 为 true。",
        "en-US":
          "Pass projectId and containerId. When nothing was compiled yet, lastCompiled is null and dirty is true.",
      },
      returns: {
        "zh-CN":
          "canvasUpdatedAt、dirty、lastCompiled 元数据、当前 entry 策略与 container。",
        "en-US":
          "canvasUpdatedAt, dirty, lastCompiled metadata, current entry strategy, and container.",
      },
      category: "runtime",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          containerId: PAGE_ID_SCHEMA,
        },
        required: ["projectId", "containerId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            containerId: "n1a2b3c4",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const containerId = readPageIdArgument(
          args.containerId,
          "containerId",
        );
        const document = getProjectCanvas(
          context.user.id,
          projectId,
        );
        const runtimeScreens = resolveRuntimeScreens(
          document,
          containerId,
        );
        const last = previewStore.get(
          previewKey(context.user.id, projectId, containerId),
        );

        return {
          projectId,
          containerId,
          canvasUpdatedAt: document.updatedAt,
          dirty: !last || last.snapshot.updatedAt !== document.updatedAt,
          lastCompiled: last
            ? {
                compiledAt: last.snapshot.compiledAt,
                updatedAt: last.snapshot.updatedAt,
                entryPageId: last.snapshot.entryPageId,
                pageCount: last.snapshot.pages.length,
                linkCount: last.snapshot.links.length,
                warningCount: last.warnings.length,
                lintSummary: last.lintSummary,
              }
            : null,
          entry: runtimeScreens.entry,
          container: runtimeScreens.container,
          screens: runtimeScreens.screens,
        };
      },
    },
    {
      name: "capture_simulator",
      title: {
        "zh-CN": "截取模拟器预览",
        "en-US": "Capture simulator",
      },
      description: {
        "zh-CN":
          "为运行时入口页面重新编译快照并生成 PNG 截图，以 MCP image content 返回，便于 Agent 查看模拟器实际入口。",
        "en-US":
          "Compile a fresh runtime snapshot and render a PNG of the entry page as MCP image content so agents can inspect the simulator entry.",
      },
      usage: {
        "zh-CN":
          "传入 projectId、containerId；entryPageId 可选，规则与 compile_preview 相同。scale 支持 0.5-3。截图使用 Chrome/Chromium，可通过 CHROME_PATH 指定浏览器路径。",
        "en-US":
          "Pass projectId and containerId; entryPageId is optional with the same rules as compile_preview. scale supports 0.5-3. Screenshots use Chrome/Chromium; set CHROME_PATH when needed.",
      },
      returns: {
        "zh-CN":
          "containerId、entryPageId、revision（canvasUpdatedAt/compiledAt）、页面尺寸、缩放与 MCP image content。",
        "en-US":
          "containerId, entryPageId, revision (canvasUpdatedAt/compiledAt), page dimensions, scale, and MCP image content.",
      },
      category: "runtime",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          containerId: PAGE_ID_SCHEMA,
          entryPageId: PAGE_ID_SCHEMA,
          scale: {
            type: "number",
            description:
              "Screenshot scale from 0.5 to 3. Defaults to 1.",
            minimum: 0.5,
            maximum: 3,
          },
        },
        required: ["projectId", "containerId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            containerId: "n1a2b3c4",
            scale: 2,
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const containerId = readPageIdArgument(
          args.containerId,
          "containerId",
        );
        const compiled = compilePreviewInternal(
          context,
          projectId,
          containerId,
          args.entryPageId,
          undefined,
        );
        const result = await capturePageScreenshot(
          context.user.id,
          projectId,
          compiled.snapshot.entryPageId,
          typeof args.scale === "number" ? args.scale : 1,
        );
        const { data, ...meta } = result;

        return {
          structuredContent: {
            ...meta,
            projectId,
            containerId,
            entryPageId: compiled.snapshot.entryPageId,
            compiledAt: compiled.snapshot.compiledAt,
            revision: {
              canvasUpdatedAt: compiled.snapshot.updatedAt,
              compiledAt: compiled.snapshot.compiledAt,
            },
            lintSummary: compiled.lint.summary,
          },
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
