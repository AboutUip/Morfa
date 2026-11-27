import { randomUUID } from "node:crypto";

import { ApiError } from "../../lib/errors.js";
import {
  MAX_CANVAS_PAGES,
  getProjectCanvas,
  saveProjectCanvas,
  type CanvasDataEntryDto,
  type CanvasDataType,
  type CanvasPageDto,
  type CanvasWidgetDto,
  type CanvasWidgetKind,
} from "../../services/canvasDocuments.js";
import {
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
  isRecord,
  loadCanvasForWrite,
  readExpectedUpdatedAt,
  readLimit,
  readCursor,
  readPageIdArgument,
} from "./canvasSupport.js";
import {
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
  type McpCapability,
} from "../types.js";

const WIDGET_KINDS = [
  "button",
  "select",
  "text",
  "input",
  "search",
  "textarea",
  "checkbox",
  "radio",
  "toggle",
  "progress",
  "slider",
  "image",
  "video",
  "avatar",
  "badge",
  "card",
  "tabs",
  "alert",
  "divider",
  "chart",
] as const;

const TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;
const DATA_TYPES = ["text", "number", "color", "date", "boolean"] as const;
const OVERFLOW_VALUES = ["visible", "hidden", "auto", "scroll"] as const;
const MAX_NODES = 16;
const MAX_LIST = 20;
const MAX_TEXT = 1000;
const MAX_NAME = 160;

const NODE_FIELDS = {
  ref: {
    type: "string" as const,
    description: "Local id used by later parentRef values in this call.",
    minLength: 1,
    maxLength: 40,
  },
  name: {
    type: "string" as const,
    description: "Layer name.",
    minLength: 1,
    maxLength: MAX_NAME,
  },
  parentRef: {
    type: "string" as const,
    description: "ref of an earlier node in this same array.",
    maxLength: 40,
  },
  parentId: {
    type: "string" as const,
    description: "Existing page id to parent under.",
    maxLength: 120,
  },
  x: { type: "number" as const, description: "X in the parent, px." },
  y: { type: "number" as const, description: "Y in the parent, px." },
  width: {
    type: "number" as const,
    description: "Width in px.",
    minimum: 1,
    maximum: 4000,
  },
  height: {
    type: "number" as const,
    description: "Height in px.",
    minimum: 1,
    maximum: 4000,
  },
  kind: {
    type: "string" as const,
    description:
      "Widget kind. text shows copy, button is a button. Omit for a plain container.",
    enum: WIDGET_KINDS,
  },
  variant: {
    type: "string" as const,
    description: "text variant: heading, paragraph, or label.",
    maxLength: 40,
  },
  text: {
    type: "string" as const,
    description: "Visible copy. Requires kind text or button.",
    maxLength: MAX_TEXT,
  },
  fill: {
    type: "string" as const,
    description:
      "Background. A color such as #f6f1e7, or a data reference such as ${self.key}.",
    maxLength: 40,
  },
  color: {
    type: "string" as const,
    description: "Text color, or a data reference such as ${self.key}.",
    maxLength: 40,
  },
  fontSize: {
    type: "number" as const,
    description: "Font size in px.",
    minimum: 1,
    maximum: 400,
  },
  fontWeight: {
    type: "number" as const,
    description: "Font weight, for example 400 or 700.",
    minimum: 100,
    maximum: 900,
  },
  textAlign: {
    type: "string" as const,
    description: "left, center, right, or justify.",
    enum: TEXT_ALIGNS,
  },
  radius: {
    type: "number" as const,
    description: "Corner radius in px.",
    minimum: 0,
    maximum: 2000,
  },
  padding: {
    type: "number" as const,
    description: "Padding in px.",
    minimum: 0,
    maximum: 400,
  },
  src: {
    type: "string" as const,
    description: "Asset URL for an image or video widget.",
    maxLength: 4000,
  },
  overflowX: {
    type: "string" as const,
    description: "CSS overflow-x: visible, hidden, auto, or scroll.",
    enum: OVERFLOW_VALUES,
  },
  overflowY: {
    type: "string" as const,
    description: "CSS overflow-y: visible, hidden, auto, or scroll.",
    enum: OVERFLOW_VALUES,
  },
  data: {
    type: "array" as const,
    description:
      "Node data entries. Styles can read them with ${self.key}. Child self also sees parent data.",
    maxItems: 40,
    items: {
      type: "object" as const,
      properties: {
        key: {
          type: "string" as const,
          description: "Data key.",
          minLength: 1,
          maxLength: 80,
        },
        type: {
          type: "string" as const,
          description: "text, number, color, date, or boolean. Defaults to text.",
          enum: DATA_TYPES,
        },
        value: {
          type: "string" as const,
          description: "Data value.",
          maxLength: 500,
        },
      },
      required: ["key", "value"],
      additionalProperties: false as const,
    },
  },
};

export interface NodeSpec {
  ref: string;
  name: string;
  parentRef?: string;
  parentId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  kind?: CanvasWidgetKind;
  variant?: string;
  text?: string;
  fill?: string;
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: string;
  radius?: number;
  padding?: number;
  src?: string;
  overflowX?: (typeof OVERFLOW_VALUES)[number];
  overflowY?: (typeof OVERFLOW_VALUES)[number];
  data?: CanvasDataEntryDto[];
}

export interface PlannedNode {
  ref: string;
  id: string;
  parentId: string | null;
  page: CanvasPageDto;
}

function px(value: number) {
  return `${value}px`;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  field: string,
  max: number,
) {
  if (record[key] === undefined) return undefined;
  if (typeof record[key] !== "string") invalidArgument(field, "必须是字符串");
  const text = (record[key] as string).trim();
  if (text.length > max) invalidArgument(field, `不能超过 ${max} 个字符`);
  return text;
}

function readNodeSpec(value: unknown, field: string): NodeSpec {
  if (!isRecord(value)) invalidArgument(field, "必须是对象");
  const ref = readOptionalString(value, "ref", `${field}.ref`, 40);
  const name = readOptionalString(value, "name", `${field}.name`, MAX_NAME);
  if (!ref || !/^[A-Za-z0-9_-]+$/.test(ref)) {
    invalidArgument(`${field}.ref`, "只能包含字母、数字、下划线和连字符");
  }
  if (!name) invalidArgument(`${field}.name`, "不能为空");

  const kind = readOptionalString(value, "kind", `${field}.kind`, 40);
  if (kind && !WIDGET_KINDS.includes(kind as (typeof WIDGET_KINDS)[number])) {
    invalidArgument(`${field}.kind`, `必须是 ${WIDGET_KINDS.join(" / ")} 之一`);
  }
  const textAlign = readOptionalString(
    value,
    "textAlign",
    `${field}.textAlign`,
    16,
  );
  if (
    textAlign &&
    !TEXT_ALIGNS.includes(textAlign as (typeof TEXT_ALIGNS)[number])
  ) {
    invalidArgument(`${field}.textAlign`, "必须是 left / center / right / justify");
  }

  const numberField = (key: keyof NodeSpec, min: number, maxValue: number) => {
    if (value[key] === undefined) return undefined;
    const number = value[key];
    if (typeof number !== "number" || !Number.isFinite(number)) {
      invalidArgument(`${field}.${key}`, "必须是数字");
    }
    if (number < min || number > maxValue) {
      invalidArgument(`${field}.${key}`, `必须在 ${min} 和 ${maxValue} 之间`);
    }
    return number;
  };

  return {
    ref,
    name,
    parentRef: readOptionalString(value, "parentRef", `${field}.parentRef`, 40),
    parentId: readOptionalString(value, "parentId", `${field}.parentId`, 120),
    x: numberField("x", -8000, 8000),
    y: numberField("y", -8000, 8000),
    width: numberField("width", 1, 4000),
    height: numberField("height", 1, 4000),
    kind: kind as CanvasWidgetKind | undefined,
    variant: readOptionalString(value, "variant", `${field}.variant`, 40),
    text: readOptionalString(value, "text", `${field}.text`, MAX_TEXT),
    fill: readOptionalString(value, "fill", `${field}.fill`, 40),
    color: readOptionalString(value, "color", `${field}.color`, 40),
    fontSize: numberField("fontSize", 1, 400),
    fontWeight: numberField("fontWeight", 100, 900),
    textAlign,
    radius: numberField("radius", 0, 2000),
    padding: numberField("padding", 0, 400),
    src: readOptionalString(value, "src", `${field}.src`, 4000),
    overflowX: readOverflow(value, "overflowX", `${field}.overflowX`),
    overflowY: readOverflow(value, "overflowY", `${field}.overflowY`),
    data: readDataEntries(value.data, `${field}.data`),
  };
}

function readOverflow(
  record: Record<string, unknown>,
  key: string,
  field: string,
) {
  const text = readOptionalString(record, key, field, 16);
  if (
    text &&
    !OVERFLOW_VALUES.includes(text as (typeof OVERFLOW_VALUES)[number])
  ) {
    invalidArgument(field, "必须是 visible / hidden / auto / scroll");
  }
  return text as (typeof OVERFLOW_VALUES)[number] | undefined;
}

function readDataEntries(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) invalidArgument(field, "必须是数组");
  if (value.length > 40) invalidArgument(field, "不能超过 40 项");
  const entries: CanvasDataEntryDto[] = [];
  const keys = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) invalidArgument(`${field}[${index}]`, "必须是对象");
    const key = readOptionalString(item, "key", `${field}[${index}].key`, 80);
    if (!key) invalidArgument(`${field}[${index}].key`, "不能为空");
    if (keys.has(key)) invalidArgument(field, `键 ${key} 重复了`);
    keys.add(key);
    const type =
      readOptionalString(item, "type", `${field}[${index}].type`, 16) ??
      "text";
    if (!DATA_TYPES.includes(type as (typeof DATA_TYPES)[number])) {
      invalidArgument(`${field}[${index}].type`, "不是合法的数据类型");
    }
    entries.push({
      key,
      type: type as CanvasDataType,
      value:
        readOptionalString(item, "value", `${field}[${index}].value`, 500) ??
        "",
    });
  }
  return entries;
}

export function readNodeSpecs(value: unknown): NodeSpec[] {
  const list = typeof value === "string" ? parseJsonList(value) : value;
  if (!Array.isArray(list)) invalidArgument("nodes", "必须是数组");
  if (list.length === 0) invalidArgument("nodes", "至少需要一个节点");
  if (list.length > MAX_NODES) {
    invalidArgument("nodes", `不能超过 ${MAX_NODES} 个节点`);
  }
  const specs = list.map((item, index) => readNodeSpec(item, `nodes[${index}]`));
  const refs = new Set<string>();
  for (const spec of specs) {
    if (refs.has(spec.ref)) {
      invalidArgument("nodes", `ref ${spec.ref} 重复了`);
    }
    refs.add(spec.ref);
  }
  return specs;
}

function parseJsonList(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    invalidArgument("nodes", "必须是合法的 JSON 数组");
  }
}

function paint(page: CanvasPageDto, spec: NodeSpec, creating: boolean) {
  if (spec.name) page.name = spec.name;
  if (spec.x !== undefined) page.x = spec.x;
  if (spec.y !== undefined) page.y = spec.y;
  if (spec.x !== undefined || spec.y !== undefined) {
    clearPositionAnchors(page.styles);
  }

  const styles = page.styles;
  const hasParent = Boolean(spec.parentId || spec.parentRef || page.parentId);
  if (creating) {
    styles.width = spec.width !== undefined ? px(spec.width) : hasParent ? "160px" : "390px";
    styles.height =
      spec.height !== undefined ? px(spec.height) : hasParent ? "48px" : "844px";
  } else {
    if (spec.width !== undefined) styles.width = px(spec.width);
    if (spec.height !== undefined) styles.height = px(spec.height);
  }
  if (spec.fill) styles["background-color"] = spec.fill;
  else if (creating && !hasParent && !spec.kind) {
    styles["background-color"] = "#ffffff";
  }
  if (spec.color) styles.color = spec.color;
  if (spec.fontSize !== undefined) styles["font-size"] = px(spec.fontSize);
  if (spec.fontWeight !== undefined) styles["font-weight"] = String(spec.fontWeight);
  if (spec.textAlign) styles["text-align"] = spec.textAlign;
  if (spec.radius !== undefined) styles["border-radius"] = px(spec.radius);
  if (spec.padding !== undefined) styles.padding = px(spec.padding);
  if (spec.overflowX) styles["overflow-x"] = spec.overflowX;
  if (spec.overflowY) styles["overflow-y"] = spec.overflowY;
  if (spec.data) {
    page.data = creating ? spec.data : mergeData(page.data, spec.data);
  }

  if (spec.kind || spec.text !== undefined || spec.variant) {
    const widget = { ...(page.widget ?? {}) } as Record<string, unknown>;
    if (spec.kind) widget.kind = spec.kind;
    else if (!widget.kind) widget.kind = "text";
    if (spec.text !== undefined) widget.text = spec.text;
    if (spec.variant) widget.variant = spec.variant;
    if (typeof widget.kind === "string") {
      page.widget = widget as unknown as CanvasWidgetDto;
    }
  }
  if (spec.src && page.widget) {
    page.widget = { ...page.widget, src: spec.src };
  }
}

function mergeData(
  current: CanvasDataEntryDto[] | undefined,
  incoming: CanvasDataEntryDto[],
) {
  const merged = [...(current ?? [])];
  for (const entry of incoming) {
    const index = merged.findIndex((item) => item.key === entry.key);
    if (index >= 0) merged[index] = entry;
    else merged.push(entry);
  }
  return merged;
}

function createPageId(used: Set<string>) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const id = `n${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new ApiError(500, "CANVAS_PAGE_ID_GENERATION_FAILED", "无法生成唯一的页面 id");
}

export function buildNodePages(
  existingIds: Set<string>,
  specs: NodeSpec[],
  createId: (used: Set<string>) => string = createPageId,
): PlannedNode[] {
  const used = new Set(existingIds);
  const byRef = new Map<string, string>();
  const planned: PlannedNode[] = [];

  for (const [index, spec] of specs.entries()) {
    let parentId = spec.parentId;
    if (spec.parentRef) {
      const resolved = byRef.get(spec.parentRef);
      if (!resolved) {
        invalidArgument(
          `nodes[${index}].parentRef`,
          `${spec.parentRef} 还没有创建，父节点要写在子节点前面`,
        );
      }
      parentId = resolved;
    } else if (parentId && !used.has(parentId) && !byRefHasId(planned, parentId)) {
      invalidArgument(`nodes[${index}].parentId`, `${parentId} 不存在`);
    }

    const id = createId(used);
    const page: CanvasPageDto = {
      id,
      name: spec.name,
      x: spec.x ?? 0,
      y: spec.y ?? 0,
      styles: {},
      ...(parentId ? { parentId } : {}),
    };
    paint(page, spec, true);
    planned.push({ ref: spec.ref, id, parentId: parentId ?? null, page });
    byRef.set(spec.ref, id);
  }

  return planned;
}

function byRefHasId(planned: PlannedNode[], id: string) {
  return planned.some((item) => item.id === id);
}

export function compactNode(page: CanvasPageDto) {
  return omitEmpty({
    id: page.id,
    name: page.name,
    parentId: page.parentId ?? "",
    x: page.x,
    y: page.y,
    width: page.styles.width ?? "",
    height: page.styles.height ?? "",
    fill: page.styles["background-color"] ?? "",
    color: page.styles.color ?? "",
    fontSize: page.styles["font-size"] ?? "",
    textAlign: page.styles["text-align"] ?? "",
    radius: page.styles["border-radius"] ?? "",
    kind: page.widget?.kind ?? "",
    variant: page.widget?.variant ?? "",
    text: page.widget?.text ?? "",
    src: page.widget?.src ?? "",
    overflowX: page.styles["overflow-x"] ?? "",
    overflowY: page.styles["overflow-y"] ?? "",
    data: (page.data ?? [])
      .map((entry) => `${entry.key}=${entry.value}`)
      .join(",")
      .slice(0, 180),
  });
}

function omitEmpty(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== "" && value !== null && value !== undefined,
    ),
  );
}

function outlineNode(page: CanvasPageDto, detail: "outline" | "layout") {
  return omitEmpty({
    id: page.id,
    name: page.name,
    parentId: page.parentId ?? "",
    kind: page.widget?.kind ?? "",
    ...(detail === "layout"
      ? {
          x: page.x,
          y: page.y,
          width: page.styles.width ?? "",
          height: page.styles.height ?? "",
        }
      : {}),
  });
}

function subtree(pages: CanvasPageDto[], rootId: string) {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pages) {
      if (page.parentId && ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id);
        changed = true;
      }
    }
  }
  return pages.filter((page) => ids.has(page.id));
}

function patchHasVisual(args: Record<string, unknown>) {
  return [
    "name",
    "text",
    "kind",
    "variant",
    "x",
    "y",
    "width",
    "height",
    "fill",
    "color",
    "fontSize",
    "fontWeight",
    "textAlign",
    "radius",
    "padding",
    "parentId",
    "src",
    "overflowX",
    "overflowY",
    "data",
  ].some((key) => args[key] !== undefined);
}

export function designCapabilities(): McpCapability[] {
  return [
    {
      name: "list_nodes",
      title: { "zh-CN": "列出节点", "en-US": "List nodes" },
      description: {
        "zh-CN":
          "分页读取节点大纲，默认只有 id、名称、父节点和种类。一次最多 20 个。要坐标或文字时再 get_nodes。",
        "en-US":
          "Read a page of node outlines: id, name, parent, and kind. At most 20. Use get_nodes for position or copy.",
      },
      usage: {
        "zh-CN":
          "传入 projectId。可选 rootId、cursor、limit（1–20）、detail=layout 才带坐标和宽高。用 nextCursor 翻页。",
        "en-US":
          "Pass projectId. Optional rootId, cursor, limit (1–20). detail=layout adds position and size. Follow nextCursor.",
      },
      returns: {
        "zh-CN": "nodes、total、cursor、nextCursor、updatedAt。",
        "en-US": "nodes, total, cursor, nextCursor, and updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          rootId: { ...PAGE_ID_SCHEMA, description: "Optional subtree root." },
          cursor: {
            type: "number",
            description: "Offset from the previous nextCursor. Default 0.",
            minimum: 0,
          },
          limit: {
            type: "number",
            description: "Page size, 1 to 20. Default 20.",
            minimum: 1,
            maximum: MAX_LIST,
          },
          detail: {
            type: "string",
            description: 'outline or layout. layout adds x, y, width, height.',
            enum: ["outline", "layout"],
          },
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [{ arguments: { projectId: "project-uuid" } }],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const document = getProjectCanvas(context.user.id, projectId);
        const pages = args.rootId
          ? subtree(document.pages, readPageIdArgument(args.rootId, "rootId"))
          : document.pages;
        if (args.rootId && pages.length === 0) {
          findPage(document, readPageIdArgument(args.rootId, "rootId"));
        }
        const cursor = readCursor(args.cursor);
        const limit = readLimit(args.limit, MAX_LIST, MAX_LIST);
        const detail = args.detail === "layout" ? "layout" : "outline";
        const slice = pages.slice(cursor, cursor + limit);
        const next = cursor + slice.length;
        return {
          projectId,
          updatedAt: document.updatedAt,
          total: pages.length,
          cursor,
          nextCursor: next < pages.length ? next : null,
          nodes: slice.map((page) => outlineNode(page, detail)),
        };
      },
    },
    {
      name: "get_nodes",
      title: { "zh-CN": "读取指定节点", "en-US": "Get nodes" },
      description: {
        "zh-CN":
          "按 id 读取最多 8 个节点的坐标、文字、颜色和数据。不要用它代替 list_nodes。",
        "en-US":
          "Read position, copy, color, and data for at most 8 node ids. Do not use this instead of list_nodes.",
      },
      usage: {
        "zh-CN": "传入 projectId 和 ids。",
        "en-US": "Pass projectId and ids.",
      },
      returns: {
        "zh-CN": "nodes 与 missing。",
        "en-US": "nodes and missing.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          ids: {
            type: "string",
            description: "Comma-separated page ids, at most 8.",
            minLength: 1,
            maxLength: 1000,
          },
        },
        required: ["projectId", "ids"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            ids: "n1a2b3c4",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const document = getProjectCanvas(context.user.id, projectId);
        const ids = (typeof args.ids === "string" ? args.ids.split(",") : [])
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, 8);
        const byId = new Map(document.pages.map((page) => [page.id, page]));
        const missing: string[] = [];
        const nodes = [];
        for (const raw of ids) {
          const id = readPageIdArgument(raw, "ids");
          const page = byId.get(id);
          if (!page) {
            missing.push(id);
            continue;
          }
          nodes.push(compactNode(page));
        }
        return { projectId, updatedAt: document.updatedAt, nodes, missing };
      },
    },
    {
      name: "create_nodes",
      title: { "zh-CN": "创建节点树", "en-US": "Create nodes" },
      description: {
        "zh-CN":
          "一次创建最多 16 个节点。父节点先写。返回只含 ref、id 和 parentId。项目节点上限会在创建前检查。",
        "en-US":
          "Create at most 16 nodes. Parents come first. The result only includes ref, id, and parentId. The page cap is checked before writing.",
      },
      usage: {
        "zh-CN":
          "先建父画面，再分批建子节点。kind 为 text 才会显示 text。未写宽高时，根节点默认 390×844，子节点默认 160×48。",
        "en-US":
          "Create the parent first, then children in small batches. kind text is required to show text. Omitted sizes default to 390×844 for a root and 160×48 for a child.",
      },
      returns: {
        "zh-CN": "created、pageCount、remaining、updatedAt。",
        "en-US": "created, pageCount, remaining, and updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          nodes: {
            type: "array",
            description: "Nodes to create, parents before children.",
            minItems: 1,
            maxItems: MAX_NODES,
            items: {
              type: "object",
              properties: NODE_FIELDS,
              required: ["ref", "name"],
              additionalProperties: false,
            },
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "nodes"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            nodes: [
              {
                ref: "screen",
                name: "宣传页",
                width: 390,
                height: 844,
                fill: "#f6f1e7",
              },
              {
                ref: "title",
                name: "标题",
                parentRef: "screen",
                kind: "text",
                variant: "heading",
                text: "墨线马克笔",
                x: 28,
                y: 96,
                width: 330,
                height: 88,
                fontSize: 42,
                fontWeight: 700,
                color: "#1c1915",
              },
            ],
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const specs = readNodeSpecs(args.nodes);
        for (const [index, spec] of specs.entries()) {
          if (spec.parentId && !spec.parentRef) {
            readPageIdArgument(spec.parentId, `nodes[${index}].parentId`);
            findPage(document, spec.parentId);
          }
        }
        const planned = buildNodePages(
          new Set(document.pages.map((page) => page.id)),
          specs,
        );
        const remaining = MAX_CANVAS_PAGES - document.pages.length;
        if (planned.length > remaining) {
          invalidArgument(
            "nodes",
            `当前 ${document.pages.length} 个节点，这次要加 ${planned.length} 个，上限 ${MAX_CANVAS_PAGES}，还能再加 ${Math.max(0, remaining)} 个`,
          );
        }
        document.pages.push(...planned.map((item) => item.page));
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return {
          projectId,
          updatedAt: saved.updatedAt,
          pageCount: saved.pages.length,
          remaining: MAX_CANVAS_PAGES - saved.pages.length,
          created: planned.map((item) => ({
            ref: item.ref,
            id: item.id,
            parentId: item.parentId,
          })),
        };
      },
    },
    {
      name: "patch_node",
      title: { "zh-CN": "修改节点", "en-US": "Patch node" },
      description: {
        "zh-CN":
          "按字段修改一个已有节点的名称、文字、颜色、字号、圆角、边距、位置、尺寸、数据、图片地址、溢出或父节点。未传入的字段保持不变。",
        "en-US":
          "Change one existing node's name, copy, color, type, radius, padding, position, size, data, image source, overflow, or parent. Omitted fields stay as they are.",
      },
      usage: {
        "zh-CN":
          "传入 projectId 和 pageId，再带上要改的字段。parentId 传空字符串可以解除父节点。text 会在没有 kind 时把节点设为 text。",
        "en-US":
          "Pass projectId, pageId, and the fields to change. An empty parentId detaches the node. text turns a plain node into kind text.",
      },
      returns: {
        "zh-CN": "更新后的节点大纲和 updatedAt。",
        "en-US": "The compact node and updatedAt.",
      },
      category: "canvas",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          name: NODE_FIELDS.name,
          parentId: {
            type: "string",
            description: 'Parent page id, or "" to detach.',
            maxLength: 120,
          },
          x: NODE_FIELDS.x,
          y: NODE_FIELDS.y,
          width: NODE_FIELDS.width,
          height: NODE_FIELDS.height,
          kind: NODE_FIELDS.kind,
          variant: NODE_FIELDS.variant,
          text: NODE_FIELDS.text,
          fill: NODE_FIELDS.fill,
          color: NODE_FIELDS.color,
          fontSize: NODE_FIELDS.fontSize,
          fontWeight: NODE_FIELDS.fontWeight,
          textAlign: NODE_FIELDS.textAlign,
          radius: NODE_FIELDS.radius,
          padding: NODE_FIELDS.padding,
          src: NODE_FIELDS.src,
          overflowX: NODE_FIELDS.overflowX,
          overflowY: NODE_FIELDS.overflowY,
          data: NODE_FIELDS.data,
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
            text: "写完再盖上",
            fontSize: 18,
            color: "#5c5146",
          },
        },
      ],
      async execute(context, args) {
        const projectId = args.projectId as string;
        const pageId = readPageIdArgument(args.pageId, "pageId");
        if (!patchHasVisual(args)) {
          invalidArgument("patch_node", "至少需要一个要修改的字段");
        }
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const page = findPage(document, pageId);
        const spec = readNodeSpec(
          { ref: "node", name: page.name, ...args, pageId: undefined, projectId: undefined },
          "patch_node",
        );
        const previousParentId = page.parentId ?? null;
        let nextParentId = previousParentId;
        if (typeof args.parentId === "string") {
          const parentId = args.parentId.trim();
          if (!parentId) {
            nextParentId = null;
          } else {
            nextParentId = readPageIdArgument(parentId, "parentId");
            assertParentAssignable(page.id, nextParentId, document.pages);
          }
        }
        const parentChanging = previousParentId !== nextParentId;
        const frames = parentChanging
          ? resolvePageFrames(document.pages, document.links)
          : null;
        const worldX = frames?.get(page.id)?.worldX ?? page.x;
        const worldY = frames?.get(page.id)?.worldY ?? page.y;
        if (typeof args.parentId === "string") {
          if (nextParentId) page.parentId = nextParentId;
          else delete page.parentId;
        }
        paint(page, { ...spec, parentId: undefined, parentRef: undefined }, false);
        if (parentChanging && frames && (spec.x === undefined || spec.y === undefined)) {
          const local = localFromWorld(
            worldX,
            worldY,
            page.parentId,
            frames,
          );
          if (spec.x === undefined) page.x = local.x;
          if (spec.y === undefined) page.y = local.y;
          clearPositionAnchors(page.styles);
        }
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return {
          projectId,
          updatedAt: saved.updatedAt,
          node: compactNode(findPage(saved, pageId)),
        };
      },
    },
  ];
}
