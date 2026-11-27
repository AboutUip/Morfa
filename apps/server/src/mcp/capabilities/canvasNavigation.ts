import type { CanvasResolvedFrame } from "@morfa/shared/canvas-layout";

import { ApiError } from "../../lib/errors.js";
import {
  getProjectCanvas,
  saveProjectCanvas,
  type CanvasDocumentDto,
  type CanvasLinkDto,
  type CanvasPageDto,
} from "../../services/canvasDocuments.js";
import {
  collectSubtreeIds,
  localFromWorld,
  resolvePageFrames,
} from "../../services/canvasFrames.js";
import {
  EXPECTED_UPDATED_AT_SCHEMA,
  PAGE_ID_SCHEMA,
  PROJECT_ID_SCHEMA,
  assertParentAssignable,
  clearPositionAnchors,
  findPage,
  invalidArgument,
  loadCanvasForWrite,
  readCssLength,
  readExpectedUpdatedAt,
  readPageIdArgument,
} from "./canvasSupport.js";
import {
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
  type McpCapability,
} from "../types.js";

type LayerPosition = "before" | "after" | "inside";

const PARENT_ID_SCHEMA = {
  type: "string" as const,
  description:
    'Parent page id, or "" to detach this page and make it a root page.',
  maxLength: 120,
};

const CSS_SIZE_SCHEMA = {
  type: "string" as const,
  description:
    'CSS size such as "320px", "50%", "calc(100% - 24px)", or a bare numeric string like "320" which is treated as px.',
};

function endpointSummary(
  page: CanvasPageDto | undefined,
  frames: Map<string, CanvasResolvedFrame>,
) {
  if (!page) return null;
  const frame = frames.get(page.id) ?? null;
  return {
    id: page.id,
    name: page.name,
    frame: page.frame ?? null,
    size: frame
      ? { width: frame.width, height: frame.height }
      : null,
  };
}

function linksWithEndpoints(
  document: CanvasDocumentDto,
  links: CanvasLinkDto[],
  frames: Map<string, CanvasResolvedFrame>,
) {
  const pagesById = new Map(
    document.pages.map((page) => [page.id, page]),
  );
  return links.map((link) => ({
    ...link,
    fromName: pagesById.get(link.fromId)?.name ?? null,
    toName: pagesById.get(link.toId)?.name ?? null,
    from: endpointSummary(pagesById.get(link.fromId), frames),
    to: endpointSummary(pagesById.get(link.toId), frames),
  }));
}

function withParentId(
  page: CanvasPageDto,
  parentId: string | null,
): CanvasPageDto {
  if (parentId) {
    return page.parentId === parentId
      ? page
      : { ...page, parentId };
  }
  if (!page.parentId) return page;
  const next = { ...page };
  delete next.parentId;
  return next;
}

function orderSubtree(
  pages: CanvasPageDto[],
  rootId: string,
  subtreeIds: Set<string>,
): CanvasPageDto[] {
  const childrenByParent = new Map<string, CanvasPageDto[]>();
  for (const page of pages) {
    if (!page.parentId) continue;
    const list = childrenByParent.get(page.parentId);
    if (list) list.push(page);
    else childrenByParent.set(page.parentId, [page]);
  }

  const ordered: CanvasPageDto[] = [];
  const visited = new Set<string>();
  const walk = (page: CanvasPageDto) => {
    if (visited.has(page.id) || !subtreeIds.has(page.id)) return;
    visited.add(page.id);
    ordered.push(page);
    for (const child of childrenByParent.get(page.id) ?? []) {
      walk(child);
    }
  };

  const root = pages.find((page) => page.id === rootId);
  if (root) walk(root);
  for (const page of pages) {
    if (subtreeIds.has(page.id) && !visited.has(page.id)) {
      ordered.push(page);
    }
  }
  return ordered;
}

export function canvasNavigationCapabilities(): McpCapability[] {
  return [
    {
      name: "get_node_context",
      title: {
        "zh-CN": "获取节点上下文",
        "en-US": "Get node context",
      },
      description: {
        "zh-CN":
          "读取单个页面的完整上下文：父级、祖先链、直接子级、子树规模、相关关联线、解析后的 frame、行为摘要与同级页面。",
        "en-US":
          "Read a page's full context: parent, ancestor chain, direct children, subtree size, touching links, resolved frame, behavior summary, and siblings.",
      },
      usage: {
        "zh-CN": "传入 projectId 与 pageId。",
        "en-US": "Pass projectId and pageId.",
      },
      returns: {
        "zh-CN":
          "node、parent、ancestors、children、subtreeCount、links、frame、size、siblings、behavior 与 updatedAt。",
        "en-US":
          "node, parent, ancestors, children, subtreeCount, links, frame, size, siblings, behavior, and updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
        },
        required: ["projectId", "pageId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = getProjectCanvas(context.user.id, projectId);
        const node = findPage(document, pageId);
        const frames = resolvePageFrames(
          document.pages,
          document.links,
        );
        const frame = frames.get(pageId) ?? null;
        const pagesById = new Map(
          document.pages.map((page) => [page.id, page]),
        );

        const parent = node.parentId
          ? (pagesById.get(node.parentId) ?? null)
          : null;

        const ancestors: CanvasPageDto[] = [];
        const visited = new Set<string>([node.id]);
        let cursor: CanvasPageDto | undefined = node;
        while (cursor?.parentId) {
          const ancestor = pagesById.get(cursor.parentId);
          if (!ancestor || visited.has(ancestor.id)) break;
          ancestors.unshift(ancestor);
          visited.add(ancestor.id);
          cursor = ancestor;
        }

        const children = document.pages.filter(
          (page) => page.parentId === node.id,
        );
        const subtreeIds = collectSubtreeIds(
          document.pages,
          node.id,
        );

        const effectiveParentId = (page: CanvasPageDto) =>
          page.parentId && pagesById.has(page.parentId)
            ? page.parentId
            : null;
        const parentId = effectiveParentId(node);
        const siblings = document.pages
          .filter(
            (page) =>
              page.id !== node.id &&
              effectiveParentId(page) === parentId,
          )
          .map((page) => {
            const frame = frames.get(page.id) ?? null;
            return {
              id: page.id,
              name: page.name,
              frame: page.frame ?? null,
              size: frame
                ? { width: frame.width, height: frame.height }
                : null,
            };
          });

        const relatedLinks = document.links.filter(
          (link) =>
            link.fromId === node.id || link.toId === node.id,
        );

        const behavior = node.behavior
          ? {
              counts: {
                version: node.behavior.version ?? 1,
                triggers: node.behavior.triggers.length,
                states: node.behavior.states.length,
                blocks: node.behavior.blocks?.length ?? 0,
                edges: node.behavior.edges?.length ?? 0,
              },
              initialStateIds: node.behavior.states
                .filter((state) => state.initial)
                .map((state) => state.id),
              triggers: node.behavior.triggers.map((trigger) => ({
                id: trigger.id,
                event: trigger.event,
                stateId: trigger.stateId ?? null,
                actionCount: trigger.actions.length,
              })),
              data: node.data ?? [],
            }
          : null;

        return {
          projectId,
          updatedAt: document.updatedAt,
          node,
          parent,
          ancestors,
          children,
          subtreeCount: subtreeIds.size,
          descendantCount: Math.max(0, subtreeIds.size - 1),
          links: linksWithEndpoints(
            document,
            relatedLinks,
            frames,
          ),
          frame,
          size: frame
            ? { width: frame.width, height: frame.height }
            : null,
          siblings,
          behavior,
        };
      },
    },
    {
      name: "list_links",
      title: {
        "zh-CN": "列出关联线",
        "en-US": "List links",
      },
      description: {
        "zh-CN":
          "列出画布上的全部关联线，并为每条线附带起止页面名称、设备框与解析尺寸。",
        "en-US":
          "List every canvas link with endpoint names, device frames, and resolved sizes.",
      },
      usage: {
        "zh-CN": "传入 projectId。",
        "en-US": "Pass projectId.",
      },
      returns: {
        "zh-CN": "links 数组、数量与 updatedAt。",
        "en-US": "The links array, count, and updatedAt.",
      },
      category: "canvas",
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
        const projectId = args.projectId as string;
        const document = getProjectCanvas(context.user.id, projectId);
        const frames = resolvePageFrames(
          document.pages,
          document.links,
        );
        const links = linksWithEndpoints(
          document,
          document.links,
          frames,
        );

        return {
          projectId,
          updatedAt: document.updatedAt,
          links,
          count: links.length,
        };
      },
    },
    {
      name: "move_page",
      title: {
        "zh-CN": "移动页面",
        "en-US": "Move page",
      },
      description: {
        "zh-CN":
          "把节点移动到指定世界坐标。有父节点时写入相对父节点的偏移，子节点保持自己的偏移并跟着父节点移动。目标节点的四边锚点会被清除。",
        "en-US":
          "Move a node to a world position. A child stores the offset from its parent, and descendants keep their own offsets so they follow. The moved node's edge anchors are cleared.",
      },
      usage: {
        "zh-CN":
          "传入 projectId、pageId、x、y。expectedUpdatedAt 可选：不一致时返回 409。",
        "en-US":
          "Pass projectId, pageId, x, and y. expectedUpdatedAt is optional and returns 409 on mismatch.",
      },
      returns: {
        "zh-CN":
          "更新后的页面、frame、位移信息与画布 updatedAt。",
        "en-US":
          "The updated page, frame, movement details, and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          x: {
            type: "number",
            description:
              "Target world X. A child stores this as an offset from its parent.",
          },
          y: {
            type: "number",
            description:
              "Target world Y. A child stores this as an offset from its parent.",
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "pageId", "x", "y"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            x: 240,
            y: 160,
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const page = findPage(document, pageId);
        const frames = resolvePageFrames(
          document.pages,
          document.links,
        );
        const currentFrame = frames.get(pageId) ?? null;
        const startX = currentFrame?.worldX ?? page.x;
        const startY = currentFrame?.worldY ?? page.y;
        const x = args.x as number;
        const y = args.y as number;
        const deltaX = x - startX;
        const deltaY = y - startY;
        const local = localFromWorld(x, y, page.parentId, frames);
        clearPositionAnchors(page.styles);
        page.x = local.x;
        page.y = local.y;

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        const savedPage = findPage(saved, pageId);
        const frame =
          resolvePageFrames(saved.pages, saved.links).get(pageId) ??
          null;

        return {
          projectId,
          updatedAt: saved.updatedAt,
          page: savedPage,
          frame,
          moved: {
            x,
            y,
            deltaX,
            deltaY,
            localX: local.x,
            localY: local.y,
          },
        };
      },
    },
    {
      name: "resize_page",
      title: {
        "zh-CN": "调整页面尺寸",
        "en-US": "Resize page",
      },
      description: {
        "zh-CN":
          "设置页面的 CSS 宽高，并清除四边锚点，使尺寸与坐标完全由 width/height 控制。支持像素、百分比与 calc() 等共享解析器支持的长度。",
        "en-US":
          "Set a page's CSS width and height and clear edge anchors so size is controlled by width/height. Supports px, percentages, calc(), and other shared resolver lengths.",
      },
      usage: {
        "zh-CN":
          'width、height 为 CSS 长度字符串；纯数字字符串按 px 处理。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          'width and height are CSS length strings; bare numeric strings are px. expectedUpdatedAt is optional and returns 409 on mismatch.',
      },
      returns: {
        "zh-CN":
          "更新后的页面、frame、尺寸与画布 updatedAt。",
        "en-US":
          "The updated page, frame, size, and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          width: CSS_SIZE_SCHEMA,
          height: CSS_SIZE_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "pageId", "width", "height"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            width: "360",
            height: "640px",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const page = findPage(document, pageId);
        const width = readCssLength(args.width, "width");
        const height = readCssLength(args.height, "height");

        page.styles.width = width;
        page.styles.height = height;
        clearPositionAnchors(page.styles);

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        const savedPage = findPage(saved, pageId);
        const frame =
          resolvePageFrames(saved.pages, saved.links).get(pageId) ??
          null;

        return {
          projectId,
          updatedAt: saved.updatedAt,
          page: savedPage,
          frame,
          size: frame
            ? { width: frame.width, height: frame.height }
            : null,
        };
      },
    },
    {
      name: "set_page_parent",
      title: {
        "zh-CN": "设置页面父级",
        "en-US": "Set page parent",
      },
      description: {
        "zh-CN":
          "把页面挂到另一个页面下，或传空字符串解除父级。会阻止自引用与循环；页面成为子页面时会移除其关联线。",
        "en-US":
          "Attach a page under another page, or pass an empty string to detach it. Self references and cycles are rejected; links touching child pages are removed.",
      },
      usage: {
        "zh-CN":
          '传入 projectId、pageId、parentId；parentId 传 "" 解除父级。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          'Pass projectId, pageId, and parentId; use "" to detach. expectedUpdatedAt is optional and returns 409 on mismatch.',
      },
      returns: {
        "zh-CN":
          "更新后的页面、frame、被移除的关联线 id 与画布 updatedAt。",
        "en-US":
          "The updated page, frame, removed link ids, and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          parentId: PARENT_ID_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "pageId", "parentId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            parentId: "n5d6e7f8",
          },
        },
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            parentId: "",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const page = findPage(document, pageId);
        const rawParentId =
          typeof args.parentId === "string"
            ? args.parentId.trim()
            : "";
        const nextParentId = rawParentId
          ? readPageIdArgument(args.parentId, "parentId")
          : null;

        const previousParentId = page.parentId ?? null;
        if (nextParentId) {
          assertParentAssignable(
            page.id,
            nextParentId,
            document.pages,
          );
        }
        if (previousParentId !== nextParentId) {
          const frames = resolvePageFrames(
            document.pages,
            document.links,
          );
          const frame = frames.get(page.id);
          const local = localFromWorld(
            frame?.worldX ?? page.x,
            frame?.worldY ?? page.y,
            nextParentId ?? undefined,
            frames,
          );
          if (nextParentId) page.parentId = nextParentId;
          else delete page.parentId;
          page.x = local.x;
          page.y = local.y;
          clearPositionAnchors(page.styles);
        }

        const parentedPageIds = new Set(
          document.pages
            .filter((item) => item.parentId)
            .map((item) => item.id),
        );
        const removedLinkIds = document.links
          .filter(
            (link) =>
              parentedPageIds.has(link.fromId) ||
              parentedPageIds.has(link.toId),
          )
          .map((link) => link.id);
        if (removedLinkIds.length) {
          const removed = new Set(removedLinkIds);
          document.links = document.links.filter(
            (link) => !removed.has(link.id),
          );
        }

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        const savedPage = findPage(saved, pageId);
        const frame =
          resolvePageFrames(saved.pages, saved.links).get(pageId) ??
          null;

        return {
          projectId,
          updatedAt: saved.updatedAt,
          page: savedPage,
          frame,
          ...(removedLinkIds.length
            ? {
                removedLinkIds,
                warnings: [
                  `页面父级变化后，${removedLinkIds.length} 条关联线已移除`,
                ],
              }
            : {}),
        };
      },
    },
    {
      name: "reorder_layers",
      title: {
        "zh-CN": "调整图层顺序",
        "en-US": "Reorder layers",
      },
      description: {
        "zh-CN":
          "按照图层树语义移动页面：inside 成为目标子级，before/after 放到目标前后并沿用目标的父级。被移动页面成为子页面时会移除相关关联线。",
        "en-US":
          "Move a page in the layer tree: inside becomes a child of the target; before/after insert as a sibling of the target. Links touching child pages are removed.",
      },
      usage: {
        "zh-CN":
          '传入 projectId、pageId、targetId、position（before / after / inside）。不能把页面移动到自身或自己的子树中。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          'Pass projectId, pageId, targetId, and position (before / after / inside). A page cannot be moved into itself or its own subtree. expectedUpdatedAt is optional and returns 409 on mismatch.',
      },
      returns: {
        "zh-CN":
          "新的页面顺序摘要、移动信息、被移除的关联线 id 与画布 updatedAt。",
        "en-US":
          "The new page order summary, move details, removed link ids, and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          targetId: PAGE_ID_SCHEMA,
          position: {
            type: "string",
            description:
              "Where to place the page relative to the target.",
            enum: ["before", "after", "inside"],
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "pageId", "targetId", "position"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            targetId: "n5d6e7f8",
            position: "inside",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const targetId = readPageIdArgument(
          args.targetId,
          "targetId",
        );
        const position = args.position as LayerPosition;
        if (
          position !== "before" &&
          position !== "after" &&
          position !== "inside"
        ) {
          invalidArgument(
            "position",
            "必须是 before / after / inside 之一",
          );
        }
        if (pageId === targetId) {
          throw new ApiError(
            400,
            "CANVAS_LAYER_MOVE_INVALID",
            "页面不能移动到自身",
          );
        }

        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        findPage(document, pageId);
        findPage(document, targetId);

        const pagesById = new Map(
          document.pages.map((page) => [page.id, page]),
        );
        const subtreeIds = collectSubtreeIds(
          document.pages,
          pageId,
        );
        if (subtreeIds.has(targetId)) {
          throw new ApiError(
            400,
            "CANVAS_LAYER_MOVE_INVALID",
            "不能把页面移动到自己的子树中",
          );
        }

        const target = pagesById.get(targetId) as CanvasPageDto;
        const moving = pagesById.get(pageId) as CanvasPageDto;
        const targetParentId =
          target.parentId && pagesById.has(target.parentId)
            ? target.parentId
            : null;
        const nextParentId =
          position === "inside" ? target.id : targetParentId;
        const frames = resolvePageFrames(
          document.pages,
          document.links,
        );
        const movingFrame = frames.get(pageId);
        const keptWorld = localFromWorld(
          movingFrame?.worldX ?? moving.x,
          movingFrame?.worldY ?? moving.y,
          nextParentId ?? undefined,
          frames,
        );
        const parentChanges =
          (moving.parentId ?? null) !== nextParentId;

        const remaining = document.pages.filter(
          (page) => !subtreeIds.has(page.id),
        );
        const subtree = orderSubtree(
          document.pages,
          pageId,
          subtreeIds,
        );
        const targetIndex = remaining.findIndex(
          (page) => page.id === targetId,
        );
        if (targetIndex < 0) {
          throw new ApiError(
            404,
            "CANVAS_PAGE_NOT_FOUND",
            `页面 ${targetId} 不存在`,
          );
        }

        let insertIndex = targetIndex;
        if (position !== "before") {
          const targetSubtree = collectSubtreeIds(
            remaining,
            targetId,
          );
          let lastTargetIndex = targetIndex;
          remaining.forEach((page, index) => {
            if (targetSubtree.has(page.id)) lastTargetIndex = index;
          });
          insertIndex = lastTargetIndex + 1;
        }

        const nextSubtree = subtree.map((page, index) => {
          if (index !== 0) return page;
          const next = withParentId(page, nextParentId);
          if (!parentChanges) return next;
          const placed = next === page ? { ...next } : next;
          placed.x = keptWorld.x;
          placed.y = keptWorld.y;
          placed.styles = { ...placed.styles };
          clearPositionAnchors(placed.styles);
          return placed;
        });
        const nextPages = [
          ...remaining.slice(0, insertIndex),
          ...nextSubtree,
          ...remaining.slice(insertIndex),
        ];

        const parentedPageIds = new Set(
          nextPages
            .filter((page) => page.parentId)
            .map((page) => page.id),
        );
        const removedLinkIds = document.links
          .filter(
            (link) =>
              parentedPageIds.has(link.fromId) ||
              parentedPageIds.has(link.toId),
          )
          .map((link) => link.id);
        const nextLinks = removedLinkIds.length
          ? document.links.filter(
              (link) => !removedLinkIds.includes(link.id),
            )
          : document.links;

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          nextPages,
          nextLinks,
        );

        return {
          projectId,
          updatedAt: saved.updatedAt,
          moved: {
            pageId,
            targetId,
            position,
            parentId: nextParentId,
          },
          order: saved.pages.map((page, index) => ({
            index,
            id: page.id,
            name: page.name,
            parentId: page.parentId ?? null,
          })),
          ...(removedLinkIds.length
            ? {
                removedLinkIds,
                warnings: [
                  `调整图层后，${removedLinkIds.length} 条关联线已移除`,
                ],
              }
            : {}),
          counts: {
            pages: saved.pages.length,
            links: saved.links.length,
          },
        };
      },
    },
  ];
}
