import { randomUUID } from "node:crypto";

import { ApiError } from "../../lib/errors.js";
import {
  getProjectCanvas,
  saveProjectCanvas,
  type CanvasDataType,
  type CanvasDocumentDto,
  type CanvasBehaviorDto,
  type CanvasFrame,
  type CanvasLinkAnchorDto,
  type CanvasLinkDto,
  type CanvasLinkEdge,
  type CanvasPageDto,
  type CanvasWidgetDto,
} from "../../services/canvasDocuments.js";
import {
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
  type McpCapability,
  type McpContext,
} from "../types.js";

const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_PAGE_ID_LENGTH = 120;
const MAX_PAGE_NAME_LENGTH = 160;
const MAX_LINK_ID_LENGTH = 120;
const MAX_LINK_COLOR_LENGTH = 64;
const MIN_LINK_WIDTH = 1;
const MAX_LINK_WIDTH = 32;
const DEFAULT_LINK_COLOR = "#8b8ff0";
const DUPLICATE_OFFSET = 24;

const DEFAULT_PAGE_STYLES: Record<string, string> = {
  width: "800px",
  height: "800px",
  "background-color": "#ffffff",
};

const DATA_TYPES = new Set<CanvasDataType>([
  "text",
  "number",
  "color",
  "date",
  "boolean",
]);

const DATA_FIELDS = new Set(["key", "type", "value", "commit"]);
const WIDGET_FIELDS = new Set([
  "kind",
  "variant",
  "text",
  "value",
  "src",
  "checked",
  "options",
  "activeIndex",
  "data",
  "description",
  "fit",
  "showValue",
  "disabled",
]);

const PROJECT_ID_SCHEMA = {
  type: "string" as const,
  description: "Morfa project id.",
  minLength: 1,
  maxLength: 120,
};

const PAGE_ID_SCHEMA = {
  type: "string" as const,
  description:
    "Page id (letters, digits, underscore, hyphen; max 120 chars).",
  minLength: 1,
  maxLength: MAX_PAGE_ID_LENGTH,
};

const LINK_ID_SCHEMA = {
  type: "string" as const,
  description: "Canvas link id.",
  minLength: 1,
  maxLength: MAX_LINK_ID_LENGTH,
};

const EXPECTED_UPDATED_AT_SCHEMA = {
  type: "number" as const,
  description:
    "Optional optimistic concurrency check. Must equal the current canvas updatedAt, otherwise the call fails with 409.",
  minimum: 0,
};

const STYLES_SCHEMA = {
  type: "string" as const,
  description:
    'JSON object of CSS style keys to string values, for example {"width":"800px","background-color":"#fff"}.',
  maxLength: 300000,
};

const DATA_SCHEMA = {
  type: "string" as const,
  description:
    'JSON array of data entries: [{"key":"title","type":"text","value":"Hello","commit":"optional"}]. Types: text, number, color, date, boolean.',
  maxLength: 300000,
};

const WIDGET_SCHEMA = {
  type: "string" as const,
  description:
    'JSON object for a page widget, for example {"kind":"button","text":"Save"}. Use "null" to clear the widget.',
  maxLength: 64000,
};

const BEHAVIOR_SCHEMA = {
  type: "string" as const,
  description:
    'JSON object for node behaviors: {"triggers":[...],"states":[...],"variables":[...]}. Use "null" to clear the behavior graph.',
  maxLength: 500000,
};

const FRAME_SCHEMA = {
  type: "string" as const,
  description:
    'Device frame: "iphone", "android", "watch", or "" to clear the frame.',
  enum: ["iphone", "android", "watch", ""],
};

const PARENT_ID_SCHEMA = {
  type: "string" as const,
  description:
    'Parent page id, or "" to detach this page from its parent.',
  maxLength: MAX_PAGE_ID_LENGTH,
};

function invalidArgument(field: string, message: string): never {
  throw new ApiError(
    400,
    "MCP_INVALID_ARGUMENTS",
    `参数 ${field} ${message}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonArgument(value: unknown, field: string): unknown {
  if (typeof value !== "string") {
    invalidArgument(field, "必须是 JSON 字符串");
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    invalidArgument(field, "必须是合法的 JSON 字符串");
  }
}

function parseStylesArgument(
  value: unknown,
  field: string,
): Record<string, string> {
  const parsed = parseJsonArgument(value, field);
  if (!isRecord(parsed)) {
    invalidArgument(field, "必须是 JSON 对象");
  }

  const styles: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    const key = rawKey.trim();
    if (!key) invalidArgument(field, "包含空样式名");
    if (typeof rawValue !== "string") {
      invalidArgument(field, `的样式 ${key} 必须是字符串`);
    }
    styles[key] = rawValue;
  }
  return styles;
}

function parseWidgetArgument(
  value: unknown,
  field: string,
): Record<string, unknown> | null {
  const parsed = parseJsonArgument(value, field);
  if (parsed === null) return null;
  if (!isRecord(parsed)) {
    invalidArgument(field, "必须是 JSON 对象或 null");
  }

  for (const key of Object.keys(parsed)) {
    if (!WIDGET_FIELDS.has(key)) {
      invalidArgument(field, `包含未知字段 ${key}`);
    }
  }

  return parsed;
}

function mergeWidgetRecords(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

function parseBehaviorArgument(
  value: unknown,
  field: string,
): CanvasBehaviorDto | null {
  const parsed = parseJsonArgument(value, field);
  if (parsed === null) return null;
  if (!isRecord(parsed)) {
    invalidArgument(field, "必须是 JSON 对象或 null");
  }
  return parsed as unknown as CanvasBehaviorDto;
}

function assertWidgetKind(widget: Record<string, unknown>) {
  if (typeof widget.kind !== "string" || !widget.kind) {
    throw new ApiError(
      400,
      "CANVAS_WIDGET_KIND_REQUIRED",
      "组件必须包含 kind 字段",
    );
  }
}

// The widget record has already passed field and kind checks; the canvas
// service normalizes every supported widget field again on save.
function asWidget(record: Record<string, unknown>): CanvasWidgetDto {
  return record as unknown as CanvasWidgetDto;
}

function parseDataArgument(
  value: unknown,
  field: string,
): CanvasPageDto["data"] {
  const parsed = parseJsonArgument(value, field);
  if (!Array.isArray(parsed)) {
    invalidArgument(field, "必须是 JSON 数组");
  }

  const entries: NonNullable<CanvasPageDto["data"]> = [];
  const keys = new Set<string>();

  for (const rawEntry of parsed) {
    if (!isRecord(rawEntry)) {
      invalidArgument(field, "的每一项都必须是 JSON 对象");
    }
    for (const key of Object.keys(rawEntry)) {
      if (!DATA_FIELDS.has(key)) {
        invalidArgument(field, `的条目包含未知字段 ${key}`);
      }
    }

    const key =
      typeof rawEntry.key === "string" ? rawEntry.key.trim() : "";
    if (!key) invalidArgument(field, "的条目缺少 key");
    if (keys.has(key)) {
      invalidArgument(field, `包含重复的 key ${key}`);
    }
    keys.add(key);

    if (
      typeof rawEntry.type !== "string" ||
      !DATA_TYPES.has(rawEntry.type as CanvasDataType)
    ) {
      invalidArgument(
        field,
        "的条目 type 必须是 text / number / color / date / boolean",
      );
    }
    if (typeof rawEntry.value !== "string") {
      invalidArgument(field, `的条目 ${key} 的 value 必须是字符串`);
    }
    if (
      rawEntry.commit !== undefined &&
      typeof rawEntry.commit !== "string"
    ) {
      invalidArgument(field, `的条目 ${key} 的 commit 必须是字符串`);
    }

    const commit =
      typeof rawEntry.commit === "string" ? rawEntry.commit.trim() : "";
    entries.push({
      key,
      type: rawEntry.type as CanvasDataType,
      value: rawEntry.value,
      ...(commit ? { commit } : {}),
    });
  }

  return entries;
}

function isLinkEdge(value: unknown): value is CanvasLinkEdge {
  return (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  );
}

function parseAnchorArgument(
  value: unknown,
  field: string,
): Partial<CanvasLinkAnchorDto> {
  const parsed = parseJsonArgument(value, field);
  if (!isRecord(parsed)) {
    invalidArgument(field, "必须是 JSON 对象");
  }

  const anchor: Partial<CanvasLinkAnchorDto> = {};
  for (const [key, rawValue] of Object.entries(parsed)) {
    if (key === "x" || key === "y") {
      if (
        typeof rawValue !== "number" ||
        !Number.isFinite(rawValue) ||
        rawValue < 0 ||
        rawValue > 1
      ) {
        invalidArgument(field, `的 ${key} 必须是 0 到 1 之间的数字`);
      }
      anchor[key] = rawValue;
    } else if (key === "edge") {
      if (!isLinkEdge(rawValue)) {
        invalidArgument(
          field,
          "的 edge 必须是 top / right / bottom / left",
        );
      }
      anchor.edge = rawValue;
    } else {
      invalidArgument(field, `包含未知字段 ${key}`);
    }
  }

  return anchor;
}

function readPageIdArgument(value: unknown, field: string): string {
  if (typeof value !== "string") {
    invalidArgument(field, "必须是字符串");
  }
  const id = value.trim();
  if (
    !id ||
    id.length > MAX_PAGE_ID_LENGTH ||
    !PAGE_ID_PATTERN.test(id) ||
    id.toLowerCase() === "self"
  ) {
    throw new ApiError(
      400,
      "CANVAS_PAGE_ID_INVALID",
      `参数 ${field} 不是合法的页面 id`,
    );
  }
  return id;
}

function readLinkIdArgument(value: unknown, field: string): string {
  if (typeof value !== "string") {
    invalidArgument(field, "必须是字符串");
  }
  const id = value.trim();
  if (!id || id.length > MAX_LINK_ID_LENGTH) {
    throw new ApiError(
      400,
      "CANVAS_LINK_ID_INVALID",
      `参数 ${field} 不是合法的关联线 id`,
    );
  }
  return id;
}

function readExpectedUpdatedAt(
  args: Record<string, unknown>,
): number | undefined {
  return typeof args.expectedUpdatedAt === "number"
    ? args.expectedUpdatedAt
    : undefined;
}

function loadCanvasForWrite(
  context: McpContext,
  projectId: string,
  expectedUpdatedAt: number | undefined,
): CanvasDocumentDto {
  const document = getProjectCanvas(context.user.id, projectId);
  if (
    expectedUpdatedAt !== undefined &&
    document.updatedAt !== expectedUpdatedAt
  ) {
    throw new ApiError(
      409,
      "CANVAS_REVISION_CONFLICT",
      `画布已更新（当前 updatedAt=${document.updatedAt}），请重新读取后再修改`,
    );
  }
  return document;
}

function findPage(
  document: CanvasDocumentDto,
  pageId: string,
): CanvasPageDto {
  const page = document.pages.find((item) => item.id === pageId);
  if (!page) {
    throw new ApiError(
      404,
      "CANVAS_PAGE_NOT_FOUND",
      `页面 ${pageId} 不存在`,
    );
  }
  return page;
}

function findLink(
  document: CanvasDocumentDto,
  linkId: string,
): CanvasLinkDto {
  const link = document.links.find((item) => item.id === linkId);
  if (!link) {
    throw new ApiError(
      404,
      "CANVAS_LINK_NOT_FOUND",
      `关联线 ${linkId} 不存在`,
    );
  }
  return link;
}

function assertParentAssignable(
  pageId: string,
  parentId: string,
  pages: CanvasPageDto[],
) {
  const parent = pages.find((item) => item.id === parentId);
  if (!parent) {
    throw new ApiError(
      404,
      "CANVAS_PAGE_PARENT_NOT_FOUND",
      `父页面 ${parentId} 不存在`,
    );
  }
  if (parent.id === pageId) {
    throw new ApiError(
      400,
      "CANVAS_PAGE_PARENT_INVALID",
      "页面不能把自己设为父页面",
    );
  }

  const visited = new Set<string>();
  let cursor: CanvasPageDto | undefined = parent;
  while (cursor?.parentId) {
    if (cursor.parentId === pageId) {
      throw new ApiError(
        400,
        "CANVAS_PAGE_PARENT_CYCLE",
        "父页面设置会形成循环",
      );
    }
    if (visited.has(cursor.parentId)) break;
    visited.add(cursor.parentId);
    cursor = pages.find((item) => item.id === cursor?.parentId);
  }
}

function assertLinkablePage(page: CanvasPageDto) {
  if (page.parentId) {
    throw new ApiError(
      409,
      "CANVAS_LINK_CHILD_PAGE",
      `页面 ${page.name} 是子页面，不能建立关联线`,
    );
  }
}

function collectDescendantIds(
  rootId: string,
  pages: CanvasPageDto[],
): string[] {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pages) {
      if (
        page.parentId &&
        ids.has(page.parentId) &&
        !ids.has(page.id)
      ) {
        ids.add(page.id);
        changed = true;
      }
    }
  }
  return pages
    .filter((page) => page.id !== rootId && ids.has(page.id))
    .map((page) => page.id);
}

function createPageId(pages: CanvasPageDto[]): string {
  const used = new Set(pages.map((page) => page.id));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = `n${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    if (!used.has(id)) return id;
  }
  throw new ApiError(
    500,
    "CANVAS_PAGE_ID_GENERATION_FAILED",
    "无法生成唯一的页面 id",
  );
}

function createLinkId(links: CanvasLinkDto[]): string {
  const used = new Set(links.map((link) => link.id));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = `l${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    if (!used.has(id)) return id;
  }
  throw new ApiError(
    500,
    "CANVAS_LINK_ID_GENERATION_FAILED",
    "无法生成唯一的关联线 id",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renameStyleReferences(
  styles: Record<string, string>,
  fromId: string,
  toId: string,
): Record<string, string> {
  const pattern = new RegExp(
    `\\$\\{\\s*${escapeRegExp(fromId)}\\s*\\.`,
    "g",
  );
  const replacement = `\${${toId}.`;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(styles)) {
    next[key] = value.replace(pattern, replacement);
  }
  return next;
}

function uniquePageName(
  baseName: string,
  pages: CanvasPageDto[],
): string {
  const base = (baseName.trim() || "Page Copy").slice(
    0,
    MAX_PAGE_NAME_LENGTH,
  );
  if (!pages.some((page) => page.name === base)) return base;

  let index = 2;
  while (true) {
    const suffix = ` ${index}`;
    const candidate = `${base.slice(
      0,
      MAX_PAGE_NAME_LENGTH - suffix.length,
    )}${suffix}`;
    if (!pages.some((page) => page.name === candidate)) {
      return candidate;
    }
    index += 1;
  }
}

function clonePage(page: CanvasPageDto): CanvasPageDto {
  return JSON.parse(JSON.stringify(page)) as CanvasPageDto;
}

function defaultLinkAnchors(
  fromPage: CanvasPageDto,
  toPage: CanvasPageDto,
): {
  fromAnchor: CanvasLinkAnchorDto;
  toAnchor: CanvasLinkAnchorDto;
} {
  const dx = toPage.x - fromPage.x;
  const dy = toPage.y - fromPage.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return {
        fromAnchor: { x: 1, y: 0.5, edge: "right" },
        toAnchor: { x: 0, y: 0.5, edge: "left" },
      };
    }
    return {
      fromAnchor: { x: 0, y: 0.5, edge: "left" },
      toAnchor: { x: 1, y: 0.5, edge: "right" },
    };
  }

  if (dy >= 0) {
    return {
      fromAnchor: { x: 0.5, y: 1, edge: "bottom" },
      toAnchor: { x: 0.5, y: 0, edge: "top" },
    };
  }
  return {
    fromAnchor: { x: 0.5, y: 0, edge: "top" },
    toAnchor: { x: 0.5, y: 1, edge: "bottom" },
  };
}

function pageResult(
  projectId: string,
  document: CanvasDocumentDto,
  page: CanvasPageDto,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    projectId,
    updatedAt: document.updatedAt,
    page,
    ...extra,
  };
}

function linkResult(
  projectId: string,
  document: CanvasDocumentDto,
  link: CanvasLinkDto,
): Record<string, unknown> {
  return {
    projectId,
    updatedAt: document.updatedAt,
    link,
  };
}

function canvasCounts(document: CanvasDocumentDto) {
  return {
    pageCount: document.pages.length,
    linkCount: document.links.length,
  };
}

const PAGE_PATCH_FIELDS = [
  "name",
  "x",
  "y",
  "styles",
  "frame",
  "lockedSize",
  "parentId",
  "data",
  "widget",
  "behavior",
] as const;

export function canvasCapabilities(): McpCapability[] {
  return [
    {
      name: "get_canvas",
      title: {
        "zh-CN": "获取画布",
        "en-US": "Get canvas",
      },
      description: {
        "zh-CN":
          "读取项目的完整画布文档，包括全部页面、关联线和画布更新时间。",
        "en-US":
          "Read the complete canvas document for a project: all pages, links, and updatedAt.",
      },
      usage: {
        "zh-CN":
          "传入 projectId。只能读取当前账号拥有或已加入的项目。",
        "en-US":
          "Pass projectId. Only projects owned by or joined by the current account are readable.",
      },
      returns: {
        "zh-CN":
          "projectId、updatedAt、pages、links 以及页面和关联线数量。",
        "en-US":
          "projectId, updatedAt, pages, links, and page/link counts.",
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
        return {
          projectId,
          updatedAt: document.updatedAt,
          pages: document.pages,
          links: document.links,
          counts: {
            pages: document.pages.length,
            links: document.links.length,
          },
        };
      },
    },
    {
      name: "get_page",
      title: {
        "zh-CN": "获取页面",
        "en-US": "Get page",
      },
      description: {
        "zh-CN":
          "读取单个页面，以及它的父页面、直接子页面和涉及的关联线。",
        "en-US":
          "Read one page together with its parent, direct children, and related links.",
      },
      usage: {
        "zh-CN": "传入 projectId 与 pageId。",
        "en-US": "Pass projectId and pageId.",
      },
      returns: {
        "zh-CN":
          "page、parent（没有则为 null）、children、links、updatedAt 与数量。",
        "en-US":
          "page, parent (null when absent), children, links, updatedAt, and counts.",
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
        { arguments: { projectId: "project-uuid", pageId: "n1a2b3c4" } },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = getProjectCanvas(context.user.id, projectId);
        const page = findPage(document, pageId);
        const parent = page.parentId
          ? (document.pages.find(
              (item) => item.id === page.parentId,
            ) ?? null)
          : null;
        const children = document.pages.filter(
          (item) => item.parentId === page.id,
        );
        const links = document.links.filter(
          (link) =>
            link.fromId === page.id || link.toId === page.id,
        );

        return {
          projectId,
          updatedAt: document.updatedAt,
          page,
          parent,
          children,
          links,
          counts: {
            children: children.length,
            links: links.length,
          },
        };
      },
    },
    {
      name: "create_page",
      title: {
        "zh-CN": "新建页面",
        "en-US": "Create page",
      },
      description: {
        "zh-CN":
          "在画布中新建页面。生成唯一页面 id，默认使用 800×800 白色样式；可指定父页面、设备框、数据与组件。",
        "en-US":
          "Create a page on the canvas with a generated unique id and 800×800 white defaults. Optionally set a parent, frame, data, and widget.",
      },
      usage: {
        "zh-CN":
          'styles、data、widget 均为 JSON 字符串。styles 会合并到默认样式；widget 传入 "null" 表示不创建组件。expectedUpdatedAt 可选：与当前 updatedAt 不一致时返回 409。',
        "en-US":
          'styles, data, and widget are JSON strings. styles merge over the defaults. Pass "null" as widget to create no widget. expectedUpdatedAt is optional; a mismatch returns 409.',
      },
      returns: {
        "zh-CN": "创建后的页面与画布 updatedAt。",
        "en-US": "The created page and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          id: {
            type: "string",
            description:
              "Optional page id. Generated when omitted. Must match [A-Za-z0-9_-]+.",
            maxLength: MAX_PAGE_ID_LENGTH,
          },
          name: {
            type: "string",
            description: "Page name.",
            minLength: 1,
            maxLength: MAX_PAGE_NAME_LENGTH,
          },
          x: {
            type: "number",
            description: "Canvas X coordinate. Defaults to 0.",
          },
          y: {
            type: "number",
            description: "Canvas Y coordinate. Defaults to 0.",
          },
          styles: STYLES_SCHEMA,
          frame: FRAME_SCHEMA,
          lockedSize: {
            type: "boolean",
            description: "Whether the page size is locked.",
          },
          parentId: PARENT_ID_SCHEMA,
          data: DATA_SCHEMA,
          widget: WIDGET_SCHEMA,
          behavior: BEHAVIOR_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "name"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            name: "Home",
            x: 120,
            y: 80,
            styles: '{"background-color":"#f8fafc"}',
            widget: '{"kind":"button","text":"Start"}',
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );

        const name =
          typeof args.name === "string" ? args.name.trim() : "";
        if (!name) invalidArgument("name", "不能为空");

        const id =
          args.id !== undefined
            ? readPageIdArgument(args.id, "id")
            : createPageId(document.pages);
        if (document.pages.some((page) => page.id === id)) {
          throw new ApiError(
            409,
            "CANVAS_PAGE_EXISTS",
            `页面 ${id} 已存在`,
          );
        }

        const stylePatch =
          args.styles !== undefined
            ? parseStylesArgument(args.styles, "styles")
            : {};
        const styles = { ...DEFAULT_PAGE_STYLES, ...stylePatch };

        const page: CanvasPageDto = {
          id,
          name,
          x: typeof args.x === "number" ? args.x : 0,
          y: typeof args.y === "number" ? args.y : 0,
          styles,
        };

        if (typeof args.frame === "string" && args.frame) {
          page.frame = args.frame as CanvasFrame;
        }
        if (typeof args.lockedSize === "boolean") {
          page.lockedSize = args.lockedSize;
        }
        if (typeof args.parentId === "string" && args.parentId.trim()) {
          const parentId = readPageIdArgument(
            args.parentId,
            "parentId",
          );
          assertParentAssignable(id, parentId, document.pages);
          page.parentId = parentId;
        }
        if (args.data !== undefined) {
          const data = parseDataArgument(args.data, "data");
          if (data && data.length) page.data = data;
        }
        if (args.widget !== undefined) {
          const widget = parseWidgetArgument(args.widget, "widget");
          if (widget) {
            const next = mergeWidgetRecords({}, widget);
            assertWidgetKind(next);
            page.widget = asWidget(next);
          }
        }
        if (args.behavior !== undefined) {
          const behavior = parseBehaviorArgument(
            args.behavior,
            "behavior",
          );
          if (behavior) page.behavior = behavior;
        }

        document.pages.push(page);
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );

        return pageResult(projectId, saved, findPage(saved, id));
      },
    },
    {
      name: "update_page",
      title: {
        "zh-CN": "更新页面",
        "en-US": "Update page",
      },
      description: {
        "zh-CN":
          "按字段局部更新页面：名称、位置、样式、设备框、尺寸锁定、父页面、数据与组件。未传入的字段保持不变。",
        "en-US":
          "Partially update a page: name, position, styles, frame, locked size, parent, data, and widget. Omitted fields are preserved.",
      },
      usage: {
        "zh-CN":
          'styles 为 JSON 字符串并与现有样式合并；data 为 JSON 字符串并整体替换数据列表，传 "[]" 清空；widget 为 JSON 字符串并与现有组件合并，传 "null" 移除组件；frame 传 "" 清除设备框；parentId 传 "" 解除父页面。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          'styles is a JSON string merged into existing styles. data is a JSON string that replaces the data list ("[]" clears it). widget is a JSON string merged into the existing widget ("null" removes it). frame "" clears the frame; parentId "" detaches the parent. expectedUpdatedAt is optional and returns 409 on mismatch.',
      },
      returns: {
        "zh-CN":
          "更新后的页面、画布 updatedAt；若设置父页面导致关联线被移除，还返回 removedLinkIds 与 warnings。",
        "en-US":
          "The updated page and canvas updatedAt. If setting a parent removes links, removedLinkIds and warnings are included.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          name: {
            type: "string",
            description: "New page name.",
            minLength: 1,
            maxLength: MAX_PAGE_NAME_LENGTH,
          },
          x: {
            type: "number",
            description: "New canvas X coordinate.",
          },
          y: {
            type: "number",
            description: "New canvas Y coordinate.",
          },
          styles: STYLES_SCHEMA,
          frame: FRAME_SCHEMA,
          lockedSize: {
            type: "boolean",
            description: "Whether the page size is locked.",
          },
          parentId: PARENT_ID_SCHEMA,
          data: DATA_SCHEMA,
          widget: WIDGET_SCHEMA,
          behavior: BEHAVIOR_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "pageId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            name: "Sign in",
            x: 200,
            y: 120,
            styles: '{"background-color":"#0f172a"}',
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const page = findPage(document, pageId);

        const hasPatch = PAGE_PATCH_FIELDS.some(
          (field) => args[field] !== undefined,
        );
        if (!hasPatch) {
          invalidArgument(
            "update_page",
            "至少需要提供一个待更新字段",
          );
        }

        if (args.name !== undefined) {
          const name =
            typeof args.name === "string" ? args.name.trim() : "";
          if (!name) invalidArgument("name", "不能为空");
          page.name = name;
        }
        if (args.x !== undefined) {
          page.x = args.x as number;
        }
        if (args.y !== undefined) {
          page.y = args.y as number;
        }
        if (args.styles !== undefined) {
          page.styles = {
            ...page.styles,
            ...parseStylesArgument(args.styles, "styles"),
          };
        }
        if (args.frame !== undefined) {
          const frame = args.frame as string;
          if (!frame) {
            delete page.frame;
          } else {
            page.frame = frame as CanvasFrame;
          }
        }
        if (args.lockedSize !== undefined) {
          page.lockedSize = args.lockedSize as boolean;
        }
        if (args.data !== undefined) {
          const data = parseDataArgument(args.data, "data");
          if (data && data.length) {
            page.data = data;
          } else {
            delete page.data;
          }
        }
        if (args.widget !== undefined) {
          const widget = parseWidgetArgument(args.widget, "widget");
          if (!widget) {
            delete page.widget;
          } else {
            const next = mergeWidgetRecords(
              (page.widget ?? {}) as Record<string, unknown>,
              widget,
            );
            assertWidgetKind(next);
            page.widget = asWidget(next);
          }
        }
        if (args.behavior !== undefined) {
          const behavior = parseBehaviorArgument(
            args.behavior,
            "behavior",
          );
          if (behavior) page.behavior = behavior;
          else delete page.behavior;
        }

        let removedLinkIds: string[] = [];
        if (args.parentId !== undefined) {
          const parentId =
            typeof args.parentId === "string"
              ? args.parentId.trim()
              : "";
          if (!parentId) {
            delete page.parentId;
          } else {
            const resolvedParentId = readPageIdArgument(
              args.parentId,
              "parentId",
            );
            assertParentAssignable(
              page.id,
              resolvedParentId,
              document.pages,
            );
            page.parentId = resolvedParentId;
          }
        }

        if (page.parentId) {
          removedLinkIds = document.links
            .filter(
              (link) =>
                link.fromId === page.id || link.toId === page.id,
            )
            .map((link) => link.id);
          if (removedLinkIds.length) {
            const removed = new Set(removedLinkIds);
            document.links = document.links.filter(
              (link) => !removed.has(link.id),
            );
          }
        }

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        const warnings = removedLinkIds.length
          ? [
              `页面已变为子页面，${removedLinkIds.length} 条关联线已移除`,
            ]
          : [];

        return pageResult(projectId, saved, findPage(saved, pageId), {
          ...(removedLinkIds.length
            ? { removedLinkIds, warnings }
            : {}),
        });
      },
    },
    {
      name: "delete_page",
      title: {
        "zh-CN": "删除页面",
        "en-US": "Delete page",
      },
      description: {
        "zh-CN":
          "删除页面及其关联线。若页面包含子页面，必须显式传入 cascade=true 才能连同子树一起删除。此操作不可撤销。",
        "en-US":
          "Delete a page and its links. If the page has children, pass cascade=true to delete the subtree too. This cannot be undone.",
      },
      usage: {
        "zh-CN":
          "传入 projectId、pageId。存在子页面时未传 cascade=true 会返回 409。expectedUpdatedAt 可选：不一致时返回 409。",
        "en-US":
          "Pass projectId and pageId. Without cascade=true, a page with children returns 409. expectedUpdatedAt is optional and returns 409 on mismatch.",
      },
      returns: {
        "zh-CN":
          "被删除的页面 id、关联线 id、数量与画布 updatedAt。",
        "en-US":
          "Deleted page ids, deleted link ids, counts, and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: DESTRUCTIVE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          cascade: {
            type: "boolean",
            description:
              "Delete the whole subtree when the page has children.",
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
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
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );
        findPage(document, pageId);

        const descendantIds = collectDescendantIds(
          pageId,
          document.pages,
        );
        if (descendantIds.length && args.cascade !== true) {
          throw new ApiError(
            409,
            "CANVAS_PAGE_HAS_CHILDREN",
            `页面包含 ${descendantIds.length} 个子页面，请传入 cascade=true 确认删除整棵子树`,
          );
        }

        const deletedPageIds = [pageId, ...descendantIds];
        const deletedSet = new Set(deletedPageIds);
        const deletedLinkIds = document.links
          .filter(
            (link) =>
              deletedSet.has(link.fromId) ||
              deletedSet.has(link.toId),
          )
          .map((link) => link.id);

        document.pages = document.pages.filter(
          (page) => !deletedSet.has(page.id),
        );
        document.links = document.links.filter(
          (link) =>
            !deletedSet.has(link.fromId) &&
            !deletedSet.has(link.toId),
        );

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );

        return {
          projectId,
          updatedAt: saved.updatedAt,
          deleted: true,
          deletedPageIds,
          deletedLinkIds,
          counts: {
            pages: deletedPageIds.length,
            links: deletedLinkIds.length,
          },
        };
      },
    },
    {
      name: "duplicate_page",
      title: {
        "zh-CN": "复制页面",
        "en-US": "Duplicate page",
      },
      description: {
        "zh-CN":
          "复制页面为新 id，保留样式、数据、组件、设备框与父页面，并重写页面内的样式变量引用。默认名称追加 Copy，位置偏移 24。",
        "en-US":
          "Duplicate a page with a new id, preserving styles, data, widget, frame, and parent, and rewriting style variable references. The name gets a Copy suffix and the position is offset by 24 by default.",
      },
      usage: {
        "zh-CN":
          "传入 projectId、pageId。可选 name、offsetX、offsetY。不会复制子页面或关联线。expectedUpdatedAt 可选：不一致时返回 409。",
        "en-US":
          "Pass projectId and pageId. Optional name, offsetX, offsetY. Children and links are not copied. expectedUpdatedAt is optional and returns 409 on mismatch.",
      },
      returns: {
        "zh-CN": "新页面、来源页面 id 与画布 updatedAt。",
        "en-US":
          "The new page, the source page id, and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          name: {
            type: "string",
            description:
              "Optional new name. A unique Copy name is generated when omitted.",
            minLength: 1,
            maxLength: MAX_PAGE_NAME_LENGTH,
          },
          offsetX: {
            type: "number",
            description: `X offset from the source page. Defaults to ${DUPLICATE_OFFSET}.`,
          },
          offsetY: {
            type: "number",
            description: `Y offset from the source page. Defaults to ${DUPLICATE_OFFSET}.`,
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "pageId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            offsetX: 48,
            offsetY: 48,
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const source = findPage(document, pageId);

        const id = createPageId(document.pages);
        const clone = clonePage(source);
        const explicitName =
          typeof args.name === "string" ? args.name.trim() : "";
        if (args.name !== undefined && !explicitName) {
          invalidArgument("name", "不能为空");
        }

        clone.id = id;
        clone.name = explicitName
          ? explicitName
          : uniquePageName(`${source.name} Copy`, document.pages);
        clone.styles = renameStyleReferences(
          clone.styles,
          source.id,
          id,
        );
        clone.x =
          source.x +
          (typeof args.offsetX === "number"
            ? args.offsetX
            : DUPLICATE_OFFSET);
        clone.y =
          source.y +
          (typeof args.offsetY === "number"
            ? args.offsetY
            : DUPLICATE_OFFSET);

        document.pages.push(clone);
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );

        return pageResult(projectId, saved, findPage(saved, id), {
          sourcePageId: pageId,
        });
      },
    },
    {
      name: "update_page_styles",
      title: {
        "zh-CN": "更新页面样式",
        "en-US": "Update page styles",
      },
      description: {
        "zh-CN":
          "更新页面的 CSS 样式。默认与现有样式合并，也可整体替换。",
        "en-US":
          "Update a page's CSS styles by merging into existing styles or replacing them entirely.",
      },
      usage: {
        "zh-CN":
          'styles 为 JSON 字符串对象；replace=true 时整体替换，否则逐键合并。要删除样式键可使用 replace 并传入完整对象。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          'styles is a JSON object string. With replace=true it replaces all styles; otherwise it merges by key. To remove keys, use replace with the complete object. expectedUpdatedAt is optional and returns 409 on mismatch.',
      },
      returns: {
        "zh-CN": "更新后的页面、应用的样式键与画布 updatedAt。",
        "en-US":
          "The updated page, the applied style keys, and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          styles: STYLES_SCHEMA,
          replace: {
            type: "boolean",
            description:
              "Replace all styles instead of merging. Defaults to false.",
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "pageId", "styles"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            styles: '{"background-color":"#111827","color":"#f9fafb"}',
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const page = findPage(document, pageId);
        const styles = parseStylesArgument(args.styles, "styles");
        const replace = args.replace === true;

        page.styles = replace
          ? styles
          : { ...page.styles, ...styles };

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );

        return pageResult(projectId, saved, findPage(saved, pageId), {
          mode: replace ? "replace" : "merge",
          styleKeys: Object.keys(styles),
        });
      },
    },
    {
      name: "update_page_widget",
      title: {
        "zh-CN": "更新页面组件",
        "en-US": "Update page widget",
      },
      description: {
        "zh-CN":
          "更新页面的组件配置。默认与现有组件合并，也可整体替换或移除组件。",
        "en-US":
          "Update a page's widget. Merge into the existing widget, replace it, or remove it.",
      },
      usage: {
        "zh-CN":
          'widget 为 JSON 字符串对象，字段值为 null 时删除该字段；传 "null" 移除整个组件。replace=true 时从空对象开始构建，否则与现有组件合并。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          'widget is a JSON object string; a null field removes that field. Pass "null" to remove the widget. With replace=true it starts from an empty widget; otherwise it merges. expectedUpdatedAt is optional and returns 409 on mismatch.',
      },
      returns: {
        "zh-CN": "更新后的页面（widget 可能不存在）与画布 updatedAt。",
        "en-US":
          "The updated page (widget may be absent) and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          widget: WIDGET_SCHEMA,
          replace: {
            type: "boolean",
            description:
              "Replace the widget instead of merging. Defaults to false.",
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "pageId", "widget"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            widget: '{"kind":"button","text":"Continue","disabled":false}',
          },
        },
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            widget: "null",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const page = findPage(document, pageId);
        const widget = parseWidgetArgument(args.widget, "widget");
        const replace = args.replace === true;

        if (!widget) {
          delete page.widget;
        } else {
          const next = mergeWidgetRecords(
            replace
              ? {}
              : ((page.widget ?? {}) as Record<string, unknown>),
            widget,
          );
          assertWidgetKind(next);
          page.widget = asWidget(next);
        }

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );

        return pageResult(projectId, saved, findPage(saved, pageId), {
          mode: !widget ? "remove" : replace ? "replace" : "merge",
        });
      },
    },
    {
      name: "update_page_data",
      title: {
        "zh-CN": "更新页面数据",
        "en-US": "Update page data",
      },
      description: {
        "zh-CN":
          "更新页面的数据条目。默认按 key 合并，也可整体替换数据列表。",
        "en-US":
          "Update a page's data entries by merging on key or replacing the whole list.",
      },
      usage: {
        "zh-CN":
          'data 为 JSON 数组字符串；合并模式下同 key 条目替换、未提及条目保留；replace=true 时整体替换，传 "[]" 清空。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          'data is a JSON array string. In merge mode, matching keys are replaced and other entries are kept. With replace=true the list is replaced; "[]" clears it. expectedUpdatedAt is optional and returns 409 on mismatch.',
      },
      returns: {
        "zh-CN":
          "更新后的页面、模式、数据 key 列表与画布 updatedAt。",
        "en-US":
          "The updated page, mode, data keys, and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          data: DATA_SCHEMA,
          replace: {
            type: "boolean",
            description:
              "Replace the whole data list instead of merging. Defaults to false.",
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "pageId", "data"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            data: '[{"key":"title","type":"text","value":"Welcome"}]',
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const page = findPage(document, pageId);
        const entries = parseDataArgument(args.data, "data") ?? [];
        const replace = args.replace === true;

        if (replace) {
          if (entries.length) {
            page.data = entries;
          } else {
            delete page.data;
          }
        } else {
          const patchByKey = new Map(
            entries.map((entry) => [entry.key, entry]),
          );
          const merged: NonNullable<CanvasPageDto["data"]> = [];

          for (const entry of page.data ?? []) {
            const patch = patchByKey.get(entry.key);
            if (patch) {
              merged.push(patch);
              patchByKey.delete(entry.key);
            } else {
              merged.push(entry);
            }
          }
          for (const patch of patchByKey.values()) {
            merged.push(patch);
          }

          if (merged.length) {
            page.data = merged;
          } else {
            delete page.data;
          }
        }

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        const savedPage = findPage(saved, pageId);

        return pageResult(projectId, saved, savedPage, {
          mode: replace ? "replace" : "merge",
          dataKeys: (savedPage.data ?? []).map((entry) => entry.key),
        });
      },
    },
    {
      name: "create_link",
      title: {
        "zh-CN": "新建关联线",
        "en-US": "Create link",
      },
      description: {
        "zh-CN":
          "在两个根页面之间创建关联线。锚点默认按页面相对位置自动选择，也可用 JSON 覆盖。",
        "en-US":
          "Create a link between two root pages. Default anchors are chosen from their relative positions and can be overridden with JSON.",
      },
      usage: {
        "zh-CN":
          'fromAnchor、toAnchor 为 JSON 字符串，格式 {"x":0.5,"y":0.5,"edge":"right"}，可只传部分字段。子页面不能建立关联线。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          'fromAnchor and toAnchor are JSON strings like {"x":0.5,"y":0.5,"edge":"right"}; partial objects are merged. Child pages cannot be linked. expectedUpdatedAt is optional and returns 409 on mismatch.',
      },
      returns: {
        "zh-CN": "创建后的关联线与画布 updatedAt。",
        "en-US": "The created link and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          fromId: PAGE_ID_SCHEMA,
          toId: PAGE_ID_SCHEMA,
          direction: {
            type: "string",
            description: "Link direction. Defaults to one-way.",
            enum: ["one-way", "two-way"],
          },
          color: {
            type: "string",
            description: `Link color. Defaults to ${DEFAULT_LINK_COLOR}.`,
            minLength: 1,
            maxLength: MAX_LINK_COLOR_LENGTH,
          },
          width: {
            type: "number",
            description: "Link width in pixels. Defaults to 2.",
            minimum: MIN_LINK_WIDTH,
            maximum: MAX_LINK_WIDTH,
          },
          dashed: {
            type: "boolean",
            description: "Whether the link is dashed. Defaults to false.",
          },
          fromAnchor: {
            type: "string",
            description:
              'Optional JSON anchor for the source page, e.g. {"x":1,"y":0.5,"edge":"right"}.',
            maxLength: 2000,
          },
          toAnchor: {
            type: "string",
            description:
              'Optional JSON anchor for the target page, e.g. {"x":0,"y":0.5,"edge":"left"}.',
            maxLength: 2000,
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "fromId", "toId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            fromId: "n1a2b3c4",
            toId: "n5d6e7f8",
            direction: "one-way",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const fromId = readPageIdArgument(args.fromId, "fromId");
        const toId = readPageIdArgument(args.toId, "toId");
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );

        if (fromId === toId) {
          throw new ApiError(
            400,
            "CANVAS_LINK_SELF",
            "关联线的起点和终点不能是同一页面",
          );
        }

        const fromPage = findPage(document, fromId);
        const toPage = findPage(document, toId);
        assertLinkablePage(fromPage);
        assertLinkablePage(toPage);

        const defaults = defaultLinkAnchors(fromPage, toPage);
        const fromAnchor =
          args.fromAnchor !== undefined
            ? {
                ...defaults.fromAnchor,
                ...parseAnchorArgument(args.fromAnchor, "fromAnchor"),
              }
            : defaults.fromAnchor;
        const toAnchor =
          args.toAnchor !== undefined
            ? {
                ...defaults.toAnchor,
                ...parseAnchorArgument(args.toAnchor, "toAnchor"),
              }
            : defaults.toAnchor;

        let color = DEFAULT_LINK_COLOR;
        if (args.color !== undefined) {
          color =
            typeof args.color === "string" ? args.color.trim() : "";
          if (!color) invalidArgument("color", "不能为空");
        }

        const link: CanvasLinkDto = {
          id: createLinkId(document.links),
          fromId,
          toId,
          direction: args.direction === "two-way" ? "two-way" : "one-way",
          color,
          width: typeof args.width === "number" ? args.width : 2,
          dashed: args.dashed === true,
          fromAnchor,
          toAnchor,
          createdAt: Date.now(),
        };

        document.links.push(link);
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );

        return linkResult(projectId, saved, findLink(saved, link.id));
      },
    },
    {
      name: "update_link",
      title: {
        "zh-CN": "更新关联线",
        "en-US": "Update link",
      },
      description: {
        "zh-CN":
          "局部更新关联线的端点、方向、颜色、宽度、虚线样式和锚点。未传入的字段保持不变。",
        "en-US":
          "Partially update a link's endpoints, direction, color, width, dash style, and anchors. Omitted fields are preserved.",
      },
      usage: {
        "zh-CN":
          'fromAnchor、toAnchor 为 JSON 字符串，与现有锚点合并。修改端点时两页面都必须是根页面。expectedUpdatedAt 可选：不一致时返回 409。',
        "en-US":
          "fromAnchor and toAnchor are JSON strings merged into the existing anchors. Both pages must remain root pages when endpoints change. expectedUpdatedAt is optional and returns 409 on mismatch.",
      },
      returns: {
        "zh-CN": "更新后的关联线与画布 updatedAt。",
        "en-US": "The updated link and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          linkId: LINK_ID_SCHEMA,
          fromId: PAGE_ID_SCHEMA,
          toId: PAGE_ID_SCHEMA,
          direction: {
            type: "string",
            description: "Link direction.",
            enum: ["one-way", "two-way"],
          },
          color: {
            type: "string",
            description: "Link color.",
            minLength: 1,
            maxLength: MAX_LINK_COLOR_LENGTH,
          },
          width: {
            type: "number",
            description: "Link width in pixels.",
            minimum: MIN_LINK_WIDTH,
            maximum: MAX_LINK_WIDTH,
          },
          dashed: {
            type: "boolean",
            description: "Whether the link is dashed.",
          },
          fromAnchor: {
            type: "string",
            description:
              'Optional JSON anchor for the source page, merged with the current anchor.',
            maxLength: 2000,
          },
          toAnchor: {
            type: "string",
            description:
              'Optional JSON anchor for the target page, merged with the current anchor.',
            maxLength: 2000,
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "linkId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            linkId: "l1a2b3c4",
            color: "#f97316",
            width: 3,
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const linkId = readLinkIdArgument(args.linkId, "linkId");
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const link = findLink(document, linkId);

        const hasPatch =
          args.fromId !== undefined ||
          args.toId !== undefined ||
          args.direction !== undefined ||
          args.color !== undefined ||
          args.width !== undefined ||
          args.dashed !== undefined ||
          args.fromAnchor !== undefined ||
          args.toAnchor !== undefined;
        if (!hasPatch) {
          invalidArgument(
            "update_link",
            "至少需要提供一个待更新字段",
          );
        }

        let fromId = link.fromId;
        let toId = link.toId;
        if (args.fromId !== undefined) {
          fromId = readPageIdArgument(args.fromId, "fromId");
        }
        if (args.toId !== undefined) {
          toId = readPageIdArgument(args.toId, "toId");
        }
        if (fromId === toId) {
          throw new ApiError(
            400,
            "CANVAS_LINK_SELF",
            "关联线的起点和终点不能是同一页面",
          );
        }
        if (
          fromId !== link.fromId ||
          toId !== link.toId
        ) {
          assertLinkablePage(findPage(document, fromId));
          assertLinkablePage(findPage(document, toId));
        }
        link.fromId = fromId;
        link.toId = toId;

        if (args.direction !== undefined) {
          link.direction = args.direction as "one-way" | "two-way";
        }
        if (args.color !== undefined) {
          const color =
            typeof args.color === "string" ? args.color.trim() : "";
          if (!color) invalidArgument("color", "不能为空");
          link.color = color;
        }
        if (args.width !== undefined) {
          link.width = args.width as number;
        }
        if (args.dashed !== undefined) {
          link.dashed = args.dashed as boolean;
        }
        if (args.fromAnchor !== undefined) {
          link.fromAnchor = {
            ...link.fromAnchor,
            ...parseAnchorArgument(args.fromAnchor, "fromAnchor"),
          };
        }
        if (args.toAnchor !== undefined) {
          link.toAnchor = {
            ...link.toAnchor,
            ...parseAnchorArgument(args.toAnchor, "toAnchor"),
          };
        }

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );

        return linkResult(projectId, saved, findLink(saved, linkId));
      },
    },
    {
      name: "delete_link",
      title: {
        "zh-CN": "删除关联线",
        "en-US": "Delete link",
      },
      description: {
        "zh-CN": "删除一条关联线。此操作不可撤销。",
        "en-US": "Delete a canvas link. This cannot be undone.",
      },
      usage: {
        "zh-CN":
          "传入 projectId 与 linkId。expectedUpdatedAt 可选：不一致时返回 409。",
        "en-US":
          "Pass projectId and linkId. expectedUpdatedAt is optional and returns 409 on mismatch.",
      },
      returns: {
        "zh-CN": "删除结果与画布 updatedAt。",
        "en-US": "The deletion result and the canvas updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: DESTRUCTIVE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          linkId: LINK_ID_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "linkId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            linkId: "l1a2b3c4",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const linkId = readLinkIdArgument(args.linkId, "linkId");
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );
        findLink(document, linkId);

        document.links = document.links.filter(
          (link) => link.id !== linkId,
        );
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );

        return {
          projectId,
          updatedAt: saved.updatedAt,
          deleted: true,
          linkId,
          ...canvasCounts(saved),
        };
      },
    },
  ];
}
