import {
  getProjectCanvas,
  saveProjectCanvas,
  type CanvasPageDto,
} from "../../services/canvasDocuments.js";
import {
  collectLayoutIssues,
  collectSubtreeIds,
  resolvePageFrames,
} from "../../services/canvasFrames.js";
import {
  EXPECTED_UPDATED_AT_SCHEMA,
  PAGE_ID_SCHEMA,
  PROJECT_ID_SCHEMA,
  clearPositionAnchors,
  findPage,
  invalidArgument,
  isRecord,
  loadCanvasForWrite,
  parseJsonArgument,
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

const MAX_BATCH_ITEMS = 200;

const LAYOUT_SCHEMA = {
  type: "string" as const,
  description:
    'JSON object with layout fields: {"x":120,"y":80,"width":"50%","left":"24px","minWidth":200}. Numbers are px; strings are CSS lengths.',
  maxLength: 64000,
};

const BATCH_ITEMS_SCHEMA = {
  type: "string" as const,
  description:
    'JSON array of layout updates: [{"pageId":"n1","x":120,"width":"50%"}]. Applied atomically in one save.',
  maxLength: 300000,
};

const LAYOUT_STYLE_KEYS: Record<string, string> = {
  width: "width",
  height: "height",
  left: "left",
  right: "right",
  top: "top",
  bottom: "bottom",
  minWidth: "min-width",
  maxWidth: "max-width",
  minHeight: "min-height",
  maxHeight: "max-height",
};

const LAYOUT_FIELDS = new Set([
  "x",
  "y",
  ...Object.keys(LAYOUT_STYLE_KEYS),
]);

interface LayoutPatch {
  x?: number;
  y?: number;
  hasX: boolean;
  hasY: boolean;
  styles: Record<string, string>;
  fields: string[];
}

function parseLayoutPatch(
  record: Record<string, unknown>,
  field: string,
): LayoutPatch {
  const patch: LayoutPatch = {
    hasX: false,
    hasY: false,
    styles: {},
    fields: [],
  };

  for (const [key, rawValue] of Object.entries(record)) {
    if (!LAYOUT_FIELDS.has(key)) {
      invalidArgument(field, `包含未知字段 ${key}`);
    }
    patch.fields.push(key);

    if (key === "x" || key === "y") {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        invalidArgument(`${field}.${key}`, "必须是有限数字");
      }
      if (key === "x") {
        patch.x = rawValue;
        patch.hasX = true;
      } else {
        patch.y = rawValue;
        patch.hasY = true;
      }
      continue;
    }

    const styleKey = LAYOUT_STYLE_KEYS[key];
    patch.styles[styleKey] = readCssLength(
      rawValue,
      `${field}.${key}`,
    );
  }

  if (patch.fields.length === 0) {
    invalidArgument(field, "至少需要提供一个布局字段");
  }

  return patch;
}

function parseLayoutArgument(
  value: unknown,
  field: string,
): LayoutPatch {
  const parsed = parseJsonArgument(value, field);
  if (!isRecord(parsed)) {
    invalidArgument(field, "必须是 JSON 对象");
  }
  return parseLayoutPatch(parsed, field);
}

function applyLayoutPatch(page: CanvasPageDto, patch: LayoutPatch) {
  if (patch.hasX) page.x = patch.x as number;
  if (patch.hasY) page.y = patch.y as number;

  // x/y are world coordinates. Any explicit edge anchor would win over them
  // in the resolver, so moving by coordinates also removes all four anchors.
  if (patch.hasX || patch.hasY) {
    clearPositionAnchors(page.styles);
  }

  for (const [key, value] of Object.entries(patch.styles)) {
    page.styles[key] = value;
  }
}

export function layoutCapabilities(): McpCapability[] {
  return [
    {
      name: "resolve_layout",
      title: {
        "zh-CN": "解析布局",
        "en-US": "Resolve layout",
      },
      description: {
        "zh-CN":
          "使用共享布局解析器计算页面节点最终位置与尺寸，并返回布局错误。可按页面过滤为该页面及其子树。",
        "en-US":
          "Resolve final positions and sizes for canvas nodes with the shared layout resolver, including layout issues. Optionally scope to a page and its subtree.",
      },
      usage: {
        "zh-CN":
          "传入 projectId；可选 pageId 只返回该页面及其后代的 frame。frame 同时包含局部坐标与世界坐标。",
        "en-US":
          "Pass projectId. Optionally pass pageId to return only that page and its descendants' frames. Frames include both local and world coordinates.",
      },
      returns: {
        "zh-CN":
          "frames、布局问题、updatedAt 与数量。",
        "en-US":
          "frames, layout issues, updatedAt, and counts.",
      },
      category: "layout",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [
        { arguments: { projectId: "project-uuid" } },
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const document = getProjectCanvas(context.user.id, projectId);
        const frames = resolvePageFrames(
          document.pages,
          document.links,
        );

        let pageId: string | undefined;
        let scope: Set<string> | null = null;
        if (args.pageId !== undefined) {
          pageId = readPageIdArgument(args.pageId, "pageId");
          findPage(document, pageId);
          scope = collectSubtreeIds(document.pages, pageId);
        }

        const frameList = document.pages
          .filter((page) => !scope || scope.has(page.id))
          .map((page) => frames.get(page.id))
          .filter((frame) => frame !== undefined);

        const issues = collectLayoutIssues(frames).filter(
          (issue) => !scope || scope.has(issue.nodeId),
        );

        return {
          projectId,
          ...(pageId ? { pageId } : {}),
          updatedAt: document.updatedAt,
          frames: frameList,
          issues,
          counts: {
            frames: frameList.length,
            issues: issues.length,
          },
        };
      },
    },
    {
      name: "set_layout",
      title: {
        "zh-CN": "设置页面布局",
        "en-US": "Set page layout",
      },
      description: {
        "zh-CN":
          "用一组布局字段更新页面：世界坐标、宽高、四边锚点与最小/最大尺寸。x/y 会清除四边锚点。",
        "en-US":
          "Update a page with layout fields: world position, size, edge anchors, and min/max constraints. Setting x/y clears all four edge anchors.",
      },
      usage: {
        "zh-CN":
          'layout 为 JSON 字符串。数字按 px 处理，也可传 "50%"、"calc(100% - 24px)" 等 CSS 长度。width/height 写入 styles.width/styles.height，left/right/top/bottom 写入对应样式，minWidth 等写入 min-width 等。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          'layout is a JSON string. Numbers are px; CSS lengths like "50%" or "calc(100% - 24px)" are accepted. width/height map to styles.width/height, edges map to left/right/top/bottom, and min/max map to min-width/max-width/min-height/max-height. expectedUpdatedAt is optional and returns 409 on mismatch.',
      },
      returns: {
        "zh-CN": "更新后的页面、解析后的 frame 与画布 updatedAt。",
        "en-US":
          "The updated page, its resolved frame, and the canvas updatedAt.",
      },
      category: "layout",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          layout: LAYOUT_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "pageId", "layout"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            layout: '{"x":120,"y":80,"width":"50%","minWidth":240}',
          },
        },
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            layout: '{"left":"24px","top":"24px","right":"24px","bottom":"24px"}',
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
        const patch = parseLayoutArgument(args.layout, "layout");
        applyLayoutPatch(page, patch);

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
        };
      },
    },
    {
      name: "batch_update_layout",
      title: {
        "zh-CN": "批量设置布局",
        "en-US": "Batch update layout",
      },
      description: {
        "zh-CN":
          "一次原子更新多个页面的布局字段，只保存一次；任何页面不存在或参数错误时不会写入。",
        "en-US":
          "Atomically update layout fields for multiple pages with a single save. If any page is missing or any item is invalid, nothing is written.",
      },
      usage: {
        "zh-CN":
          'items 为 JSON 数组，每项包含 pageId 与布局字段（x/y/width/height/left/right/top/bottom/minWidth/maxWidth/minHeight/maxHeight）。同一页面不能重复出现。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          "items is a JSON array where each entry has pageId plus layout fields. A page cannot appear twice. expectedUpdatedAt is optional and returns 409 on mismatch.",
      },
      returns: {
        "zh-CN":
          "更新后的页面、各页面 frame、画布 updatedAt 与数量。",
        "en-US":
          "Updated pages, their frames, the canvas updatedAt, and counts.",
      },
      category: "layout",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          items: BATCH_ITEMS_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "items"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            items:
              '[{"pageId":"n1a2b3c4","x":120,"y":80},{"pageId":"n5d6e7f8","width":"100%","height":480}]',
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const parsed = parseJsonArgument(args.items, "items");
        if (!Array.isArray(parsed)) {
          invalidArgument("items", "必须是 JSON 数组");
        }
        if (parsed.length === 0) {
          invalidArgument("items", "至少需要包含一项");
        }
        if (parsed.length > MAX_BATCH_ITEMS) {
          invalidArgument(
            "items",
            `不能超过 ${MAX_BATCH_ITEMS} 项`,
          );
        }

        const updates: Array<{
          pageId: string;
          patch: LayoutPatch;
        }> = [];
        const usedPageIds = new Set<string>();

        parsed.forEach((rawItem, index) => {
          if (!isRecord(rawItem)) {
            invalidArgument(`items[${index}]`, "必须是 JSON 对象");
          }
          const { pageId: rawPageId, ...layoutFields } = rawItem;
          if (rawPageId === undefined) {
            invalidArgument(`items[${index}]`, "缺少 pageId");
          }
          const pageId = readPageIdArgument(
            rawPageId,
            `items[${index}].pageId`,
          );
          if (usedPageIds.has(pageId)) {
            invalidArgument(
              "items",
              `中页面 ${pageId} 出现了多次`,
            );
          }
          usedPageIds.add(pageId);
          updates.push({
            pageId,
            patch: parseLayoutPatch(
              layoutFields,
              `items[${index}]`,
            ),
          });
        });

        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );

        // Validate every target before mutating anything so a missing page
        // aborts the whole batch without a save.
        const targets = updates.map((update) => ({
          page: findPage(document, update.pageId),
          patch: update.patch,
        }));

        for (const target of targets) {
          applyLayoutPatch(target.page, target.patch);
        }

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        const frames = resolvePageFrames(saved.pages, saved.links);
        const savedById = new Map(
          saved.pages.map((page) => [page.id, page]),
        );

        const results = updates.map((update) => {
          const page = savedById.get(update.pageId) as CanvasPageDto;
          return {
            pageId: update.pageId,
            page,
            frame: frames.get(update.pageId) ?? null,
          };
        });

        return {
          projectId,
          updatedAt: saved.updatedAt,
          items: results,
          frames: results.map((item) => item.frame),
          counts: {
            pages: results.length,
          },
        };
      },
    },
  ];
}
