import { randomUUID } from "node:crypto";

import { ApiError } from "../../lib/errors.js";
import {
  getProjectCanvas,
  saveProjectCanvas,
  type CanvasBehaviorActionDto,
  type CanvasBehaviorConditionDto,
  type CanvasPageDto,
} from "../../services/canvasDocuments.js";
import {
  computeControlSignature,
  getCompiledControls,
  getControlInstances,
  getControlPages,
  getControlStates,
  getControlStateSubtree,
  getControlSummary,
  isControlInstancePage,
  isControlPage,
  isControlStatePage,
} from "../../services/canvasControls.js";
import { lintCanvas } from "../../services/canvasLint.js";
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
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
  type McpCapability,
  type McpContext,
} from "../types.js";

const CONTROL_ID_SCHEMA = {
  type: "string" as const,
  description: "Control definition page id.",
  minLength: 1,
  maxLength: 120,
};
const STATE_ID_SCHEMA = {
  type: "string" as const,
  description: "Control state page id.",
  minLength: 1,
  maxLength: 120,
};
const STYLES_SCHEMA = {
  type: "string" as const,
  description:
    'Optional JSON object of CSS styles for the state root, e.g. {"background-color":"transparent"}.',
  maxLength: 64000,
};
const TARGET_SCHEMA = {
  type: "string" as const,
  description: "Target platform.",
  enum: ["software", "website", "both"],
};

function newPageId(pages: CanvasPageDto[], prefix = "n") {
  const used = new Set(pages.map((page) => page.id));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = `${prefix}${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    if (!used.has(id)) return id;
  }
  throw new ApiError(
    500,
    "CANVAS_ID_GENERATION_FAILED",
    "无法生成唯一页面 id",
  );
}

function readStyles(value: unknown, field: string): Record<string, string> {
  if (value === undefined) return {};
  const parsed = parseJsonArgument(value, field);
  if (!isRecord(parsed)) invalidArgument(field, "必须是 JSON 对象");
  const styles: Record<string, string> = {};
  for (const [key, raw] of Object.entries(parsed)) {
    if (typeof raw !== "string") {
      invalidArgument(field, `${key} 必须是字符串`);
    }
    styles[key.trim()] = raw;
  }
  return styles;
}

function readStateSize(
  args: Record<string, unknown>,
  fallback = { width: "800px", height: "600px" },
) {
  return {
    width:
      args.width === undefined
        ? fallback.width
        : readCssLength(args.width, "width"),
    height:
      args.height === undefined
        ? fallback.height
        : readCssLength(args.height, "height"),
  };
}

function findControl(document: ReturnType<typeof getProjectCanvas>, id: string) {
  const page = document.pages.find(
    (item) => isControlPage(item) && item.id === id,
  );
  if (!page) {
    throw new ApiError(404, "CONTROL_NOT_FOUND", `控件 ${id} 不存在`);
  }
  return page;
}

function assertStateBelongsToControl(
  document: ReturnType<typeof getProjectCanvas>,
  controlId: string,
  stateId: string,
) {
  const state = document.pages.find(
    (page) =>
      isControlStatePage(page) &&
      page.id === stateId &&
      page.controlId === controlId,
  );
  if (!state) {
    throw new ApiError(
      404,
      "CONTROL_STATE_NOT_FOUND",
      `控件 ${controlId} 不存在状态 ${stateId}`,
    );
  }
  return state;
}

function controlResult(
  document: ReturnType<typeof getProjectCanvas>,
  control: CanvasPageDto,
  origin?: string,
) {
  return {
    control: getControlSummary(document.pages, control, origin),
    updatedAt: document.updatedAt,
  };
}

interface CloneRemap {
  idMap: Map<string, string>;
  pageId: string;
}

function cloneControlTree(
  document: ReturnType<typeof getProjectCanvas>,
  control: CanvasPageDto,
): { pages: CanvasPageDto[]; cloned: CanvasPageDto[] } {
  const states = getControlStates(document.pages, control.id);
  const all = [
    control,
    ...states.flatMap((state) =>
      getControlStateSubtree(document.pages, state.id),
    ),
  ];
  const unique = [...new Map(all.map((page) => [page.id, page])).values()];
  const idMap = new Map<string, string>();
  for (const page of unique) {
    idMap.set(page.id, newPageId(document.pages, "n"));
  }

  const remapBehavior = (page: CanvasPageDto) => {
    if (!page.behavior) return page.behavior;
    const remapTarget = (value: string | undefined) =>
      value ? idMap.get(value) ?? value : value;
    return {
      ...page.behavior,
      triggers: page.behavior.triggers.map((trigger) => ({
        ...trigger,
        actions: trigger.actions.map((action) => ({
          ...action,
          ...(action.targetId
            ? { targetId: remapTarget(action.targetId) }
            : {}),
          ...(action.type === "navigate" && action.pageId
            ? { pageId: remapTarget(action.pageId) }
            : {}),
          ...(action.type === "setControlState" && action.value
            ? { value: idMap.get(action.value) ?? action.value }
            : {}),
        })),
        ...(trigger.conditions
          ? {
              conditions: trigger.conditions.map((condition) => ({
                ...condition,
                ...(condition.targetId
                  ? { targetId: remapTarget(condition.targetId) }
                  : {}),
                ...(condition.source === "controlState" &&
                condition.value
                  ? {
                      value:
                        idMap.get(condition.value) ?? condition.value,
                    }
                  : {}),
              })),
            }
          : {}),
      })),
      blocks: page.behavior.blocks?.map((block) => ({
        ...block,
        ...(block.action
          ? {
              action: {
                ...block.action,
                ...(block.action.targetId
                  ? {
                      targetId: remapTarget(block.action.targetId),
                    }
                  : {}),
                ...(block.action.type === "navigate" &&
                block.action.pageId
                  ? { pageId: remapTarget(block.action.pageId) }
                  : {}),
                ...(block.action.type === "setControlState" &&
                block.action.value
                  ? {
                      value:
                        idMap.get(block.action.value) ??
                        block.action.value,
                    }
                  : {}),
              },
            }
          : {}),
        ...(block.condition
          ? {
              condition: {
                ...block.condition,
                ...(block.condition.targetId
                  ? {
                      targetId: remapTarget(block.condition.targetId),
                    }
                  : {}),
                ...(block.condition.source === "controlState" &&
                block.condition.value
                  ? {
                      value:
                        idMap.get(block.condition.value) ??
                        block.condition.value,
                    }
                  : {}),
              },
            }
          : {}),
      })),
      edges: page.behavior.edges?.map((edge) => ({
        ...edge,
        from: idMap.get(edge.from) ?? edge.from,
        to: idMap.get(edge.to) ?? edge.to,
      })),
    };
  };

  const cloned = unique.map((page) => {
    const nextId = idMap.get(page.id) as string;
    return {
      ...JSON.parse(JSON.stringify(page)),
      id: nextId,
      ...(page.parentId
        ? { parentId: idMap.get(page.parentId) ?? page.parentId }
        : {}),
      ...(page.controlId
        ? { controlId: idMap.get(page.controlId) ?? page.controlId }
        : {}),
      ...(page.controlStateId
        ? {
            controlStateId:
              idMap.get(page.controlStateId) ?? page.controlStateId,
          }
        : {}),
      behavior: remapBehavior(page),
    } as CanvasPageDto;
  });

  const clonedControl = cloned.find(
    (page) => page.id === idMap.get(control.id),
  ) as CanvasPageDto;
  const clonedDefaultState = idMap.get(
    control.control?.defaultStateId ?? "",
  );
  if (clonedControl.control && clonedDefaultState) {
    clonedControl.control.defaultStateId = clonedDefaultState;
  }

  return { pages: cloned, cloned };
}

export function controlCapabilities(): McpCapability[] {
  return [
    {
      name: "list_controls",
      title: { "zh-CN": "列出控件", "en-US": "List controls" },
      description: {
        "zh-CN": "列出项目中的控件定义、状态与编译状态。",
        "en-US": "List project control definitions, states, and compile status.",
      },
      usage: {
        "zh-CN": "传入 projectId。compiledOnly 为 true 时只返回已编译控件。",
        "en-US": "Pass projectId. Set compiledOnly to return compiled controls only.",
      },
      returns: {
        "zh-CN": "控件摘要数组、数量与 updatedAt。",
        "en-US": "Control summaries, count, and updatedAt.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          compiledOnly: {
            type: "boolean",
            description: "Only return compiled controls.",
            default: false,
          },
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [
        { arguments: { projectId: "project-uuid" } },
        { arguments: { projectId: "project-uuid", compiledOnly: true } },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const document = getProjectCanvas(context.user.id, projectId);
        const controls = (
          args.compiledOnly === true
            ? getCompiledControls(document.pages)
            : getControlPages(document.pages)
        ).map((control) =>
          getControlSummary(document.pages, control, context.origin),
        );
        return {
          projectId,
          updatedAt: document.updatedAt,
          count: controls.length,
          controls,
        };
      },
    },
    {
      name: "get_control",
      title: { "zh-CN": "读取控件", "en-US": "Get control" },
      description: {
        "zh-CN": "读取控件定义、全部状态、状态节点树和控件根行为。",
        "en-US": "Read a control definition, all states, state node trees, and root behavior.",
      },
      usage: {
        "zh-CN": "传入 projectId 与 controlId。",
        "en-US": "Pass projectId and controlId.",
      },
      returns: {
        "zh-CN": "控件摘要、状态节点树、behavior 与 updatedAt。",
        "en-US": "Control summary, state node trees, behavior, and updatedAt.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          controlId: CONTROL_ID_SCHEMA,
        },
        required: ["projectId", "controlId"],
        additionalProperties: false,
      },
      examples: [
        { arguments: { projectId: "project-uuid", controlId: "n123" } },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const controlId = readPageIdArgument(args.controlId, "controlId");
        const document = getProjectCanvas(context.user.id, projectId);
        const control = findControl(document, controlId);
        return {
          ...controlResult(document, control, context.origin),
          controlPage: control,
          states: getControlStates(document.pages, controlId).map((state) => ({
            id: state.id,
            name: state.name,
            styles: state.styles,
            nodes: getControlStateSubtree(document.pages, state.id)
              .filter((page) => page.id !== state.id)
              .map((page) => ({
                ...page,
                frame: {
                  x: page.x,
                  y: page.y,
                },
              })),
          })),
        };
      },
    },
    {
      name: "create_control",
      title: { "zh-CN": "创建控件", "en-US": "Create control" },
      description: {
        "zh-CN": "创建一个带默认状态的项目控件定义，状态节点树初始为空。",
        "en-US": "Create a control definition with one empty default state.",
      },
      usage: {
        "zh-CN":
          "name、width、height 可选；target 为 software/website/both；styles 为状态根样式 JSON。",
        "en-US":
          "name, width, and height are optional; target is software/website/both; styles is a JSON object for the state root.",
      },
      returns: {
        "zh-CN": "创建的控件摘要、controlId 与默认 stateId。",
        "en-US": "Created control summary, controlId, and default stateId.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          name: {
            type: "string",
            description: "Control name.",
            minLength: 1,
            maxLength: 160,
          },
          description: {
            type: "string",
            description: "Optional description.",
            maxLength: 500,
          },
          target: TARGET_SCHEMA,
          width: {
            type: "string",
            description: "Default state width (px/%/calc).",
            maxLength: 200,
          },
          height: {
            type: "string",
            description: "Default state height (px/%/calc).",
            maxLength: 200,
          },
          styles: STYLES_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            name: "More",
            width: "48px",
            height: "48px",
            target: "both",
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const controlId = newPageId(document.pages);
        const stateId = newPageId(document.pages);
        const size = readStateSize(args, { width: "48px", height: "48px" });
        const styles = {
          "background-color": "transparent",
          ...readStyles(args.styles, "styles"),
          width: size.width,
          height: size.height,
        };
        const name =
          typeof args.name === "string" && args.name.trim()
            ? args.name.trim()
            : "Control";
        const target =
          args.target === "software" ||
          args.target === "website" ||
          args.target === "both"
            ? args.target
            : "both";
        const description =
          typeof args.description === "string"
            ? args.description.trim().slice(0, 500)
            : "";
        document.pages.push({
          id: controlId,
          name,
          x: 0,
          y: 0,
          nodeKind: "control",
          styles: {
            width: size.width,
            height: size.height,
            "background-color": "transparent",
          },
          control: {
            status: "draft",
            defaultStateId: stateId,
            ...(description ? { description } : {}),
            target,
          },
        });
        document.pages.push({
          id: stateId,
          name: "Default",
          x: 0,
          y: 0,
          nodeKind: "control-state",
          controlId,
          styles,
        });
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        const control = findControl(saved, controlId);
        return {
          ...controlResult(saved, control, context.origin),
          controlId,
          defaultStateId: stateId,
        };
      },
    },
    {
      name: "update_control",
      title: { "zh-CN": "更新控件", "en-US": "Update control" },
      description: {
        "zh-CN": "更新控件名称、描述、目标平台与默认状态。",
        "en-US": "Update control name, description, target, and default state.",
      },
      usage: {
        "zh-CN": "只传需要修改的字段；defaultStateId 必须属于该控件。",
        "en-US": "Pass only changed fields; defaultStateId must belong to the control.",
      },
      returns: {
        "zh-CN": "更新后的控件摘要与 updatedAt。",
        "en-US": "Updated control summary and updatedAt.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          controlId: CONTROL_ID_SCHEMA,
          name: { type: "string", description: "Display name.", minLength: 1, maxLength: 160 },
          description: { type: "string", description: "Optional description.", maxLength: 500 },
          target: TARGET_SCHEMA,
          defaultStateId: STATE_ID_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "controlId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            controlId: "n123",
            name: "More actions",
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const controlId = readPageIdArgument(args.controlId, "controlId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const control = findControl(document, controlId);
        if (!control.control) invalidArgument("controlId", "不是控件定义");
        if (typeof args.name === "string" && args.name.trim()) {
          control.name = args.name.trim().slice(0, 160);
        }
        if (typeof args.description === "string") {
          control.control.description = args.description
            .trim()
            .slice(0, 500);
        }
        if (
          args.target === "software" ||
          args.target === "website" ||
          args.target === "both"
        ) {
          control.control.target = args.target;
        }
        if (typeof args.defaultStateId === "string") {
          const stateId = readPageIdArgument(
            args.defaultStateId,
            "defaultStateId",
          );
          assertStateBelongsToControl(document, controlId, stateId);
          control.control.defaultStateId = stateId;
        }
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return controlResult(
          saved,
          findControl(saved, controlId),
          context.origin,
        );
      },
    },
    {
      name: "add_control_state",
      title: { "zh-CN": "新增控件状态", "en-US": "Add control state" },
      description: {
        "zh-CN": "为控件新增一个状态变体，拥有独立尺寸与节点树。",
        "en-US": "Add a state variant with its own size and node tree.",
      },
      usage: {
        "zh-CN": "name、width、height、styles 可选。",
        "en-US": "name, width, height, and styles are optional.",
      },
      returns: {
        "zh-CN": "新状态 id 与更新后的控件摘要。",
        "en-US": "New state id and updated control summary.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          controlId: CONTROL_ID_SCHEMA,
          name: { type: "string", description: "Display name.", minLength: 1, maxLength: 160 },
          width: { type: "string", description: "Width CSS length.", maxLength: 200 },
          height: { type: "string", description: "Height CSS length.", maxLength: 200 },
          styles: STYLES_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "controlId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            controlId: "n123",
            name: "Expanded",
            width: "220px",
            height: "180px",
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const controlId = readPageIdArgument(args.controlId, "controlId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const control = findControl(document, controlId);
        const stateId = newPageId(document.pages);
        const size = readStateSize(args, {
          width: control.styles.width ?? "800px",
          height: control.styles.height ?? "600px",
        });
        document.pages.push({
          id: stateId,
          name:
            typeof args.name === "string" && args.name.trim()
              ? args.name.trim().slice(0, 160)
              : "State",
          x: 0,
          y: 0,
          nodeKind: "control-state",
          controlId,
          styles: {
            "background-color": "transparent",
            ...readStyles(args.styles, "styles"),
            width: size.width,
            height: size.height,
          },
        });
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return {
          stateId,
          ...controlResult(
            saved,
            findControl(saved, controlId),
            context.origin,
          ),
        };
      },
    },
    {
      name: "update_control_state",
      title: { "zh-CN": "更新控件状态", "en-US": "Update control state" },
      description: {
        "zh-CN": "更新控件状态的名称、尺寸或样式。",
        "en-US": "Update a control state's name, size, or styles.",
      },
      usage: {
        "zh-CN": "width/height/styles 可选，styles 会与现有样式合并。",
        "en-US": "width, height, and styles are optional; styles merge into existing styles.",
      },
      returns: {
        "zh-CN": "更新后的状态 id 与控件摘要。",
        "en-US": "Updated state id and control summary.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          controlId: CONTROL_ID_SCHEMA,
          stateId: STATE_ID_SCHEMA,
          name: { type: "string", description: "Display name.", minLength: 1, maxLength: 160 },
          width: { type: "string", description: "Width CSS length.", maxLength: 200 },
          height: { type: "string", description: "Height CSS length.", maxLength: 200 },
          styles: STYLES_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "controlId", "stateId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            controlId: "n123",
            stateId: "n456",
            width: "240px",
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const controlId = readPageIdArgument(args.controlId, "controlId");
        const stateId = readPageIdArgument(args.stateId, "stateId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const state = assertStateBelongsToControl(
          document,
          controlId,
          stateId,
        );
        if (typeof args.name === "string" && args.name.trim()) {
          state.name = args.name.trim().slice(0, 160);
        }
        if (args.width !== undefined) {
          state.styles.width = readCssLength(args.width, "width");
        }
        if (args.height !== undefined) {
          state.styles.height = readCssLength(args.height, "height");
        }
        Object.assign(state.styles, readStyles(args.styles, "styles"));
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return {
          stateId,
          ...controlResult(
            saved,
            findControl(saved, controlId),
            context.origin,
          ),
        };
      },
    },
    {
      name: "delete_control_state",
      title: { "zh-CN": "删除控件状态", "en-US": "Delete control state" },
      description: {
        "zh-CN": "删除一个非默认控件状态及其节点树。",
        "en-US": "Delete a non-default control state and its node tree.",
      },
      usage: {
        "zh-CN": "不能删除默认状态或最后一个状态。",
        "en-US": "Default and last remaining states cannot be deleted.",
      },
      returns: {
        "zh-CN": "删除结果与控件摘要。",
        "en-US": "Deletion result and control summary.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: DESTRUCTIVE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          controlId: CONTROL_ID_SCHEMA,
          stateId: STATE_ID_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "controlId", "stateId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            controlId: "n123",
            stateId: "n456",
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const controlId = readPageIdArgument(args.controlId, "controlId");
        const stateId = readPageIdArgument(args.stateId, "stateId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const control = findControl(document, controlId);
        assertStateBelongsToControl(document, controlId, stateId);
        const states = getControlStates(document.pages, controlId);
        if (states.length <= 1) {
          throw new ApiError(
            409,
            "CONTROL_LAST_STATE",
            "控件至少需要保留一个状态",
          );
        }
        if (control.control?.defaultStateId === stateId) {
          throw new ApiError(
            409,
            "CONTROL_DEFAULT_STATE",
            "不能删除默认状态，请先切换默认状态",
          );
        }
        const ids = new Set(
          getControlStateSubtree(document.pages, stateId).map(
            (page) => page.id,
          ),
        );
        document.pages = document.pages.filter(
          (page) => !ids.has(page.id),
        );
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return {
          stateId,
          deleted: true,
          ...controlResult(
            saved,
            findControl(saved, controlId),
            context.origin,
          ),
        };
      },
    },
    {
      name: "compile_control",
      title: { "zh-CN": "编译控件", "en-US": "Compile control" },
      description: {
        "zh-CN": "校验控件状态与行为，成功后标记为已编译并加入“我的组件”。",
        "en-US": "Validate control states and behavior, then mark it compiled for My Components.",
      },
      usage: {
        "zh-CN": "错误会阻止编译；成功后记录 compiledAt、compiledRevision 与签名。",
        "en-US": "Errors block compilation; on success compiledAt, compiledRevision, and a signature are stored.",
      },
      returns: {
        "zh-CN": "编译结果、错误与控件摘要。",
        "en-US": "Compile result, errors, and control summary.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          controlId: CONTROL_ID_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "controlId"],
        additionalProperties: false,
      },
      examples: [
        { arguments: { projectId: "project-uuid", controlId: "n123" } },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const controlId = readPageIdArgument(args.controlId, "controlId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const control = findControl(document, controlId);
        if (!control.control) invalidArgument("controlId", "不是控件定义");
        const stateIds = new Set(
          getControlStates(document.pages, controlId).map(
            (state) => state.id,
          ),
        );
        const nodeIds = new Set<string>([controlId]);
        for (const id of stateIds) {
          for (const page of getControlStateSubtree(document.pages, id)) {
            nodeIds.add(page.id);
          }
        }
        const lint = lintCanvas(document, { pageIds: nodeIds });
        const errors = lint.errors;
        if (errors.length > 0) {
          throw new ApiError(
            400,
            "CONTROL_COMPILE_FAILED",
            `控件编译失败，存在 ${errors.length} 个错误`,
          );
        }
        if (!control.control.defaultStateId ||
            !stateIds.has(control.control.defaultStateId)) {
          throw new ApiError(
            400,
            "CONTROL_DEFAULT_STATE_MISSING",
            "控件默认状态不存在",
          );
        }
        const nextRevision =
          (control.control.compiledRevision ?? 0) + 1;
        control.control.status = "compiled";
        control.control.compiledAt = Date.now();
        control.control.compiledRevision = nextRevision;
        control.control.compiledSig = computeControlSignature(
          document.pages,
          controlId,
        );
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return {
          compiled: true,
          warnings: lint.warnings,
          ...controlResult(
            saved,
            findControl(saved, controlId),
            context.origin,
          ),
        };
      },
    },
    {
      name: "list_compiled_components",
      title: {
        "zh-CN": "列出我的组件",
        "en-US": "List compiled components",
      },
      description: {
        "zh-CN": "列出可拖入页面的已编译控件（“我的组件”）。",
        "en-US": "List compiled controls available in My Components.",
      },
      usage: {
        "zh-CN": "传入 projectId。",
        "en-US": "Pass projectId.",
      },
      returns: {
        "zh-CN": "已编译控件摘要与数量。",
        "en-US": "Compiled control summaries and count.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: { projectId: PROJECT_ID_SCHEMA },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [{ arguments: { projectId: "project-uuid" } }],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const document = getProjectCanvas(context.user.id, projectId);
        const controls = getCompiledControls(document.pages).map(
          (control) =>
            getControlSummary(document.pages, control, context.origin),
        );
        return {
          projectId,
          updatedAt: document.updatedAt,
          count: controls.length,
          components: controls,
        };
      },
    },
    {
      name: "create_control_instance",
      title: {
        "zh-CN": "创建控件实例",
        "en-US": "Create control instance",
      },
      description: {
        "zh-CN": "将已编译控件拖入页面/节点，创建可保留独立运行状态的控件实例。",
        "en-US": "Place a compiled control into a page as an instance with independent runtime state.",
      },
      usage: {
        "zh-CN":
          "controlId 必须已编译；可选 parentId、stateId、x/y/width/height。",
        "en-US":
          "controlId must be compiled; parentId, stateId, x/y, and width/height are optional.",
      },
      returns: {
        "zh-CN": "实例页面 id、控件摘要与 updatedAt。",
        "en-US": "Instance page id, control summary, and updatedAt.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          controlId: CONTROL_ID_SCHEMA,
          parentId: {
            type: "string",
            description: "Optional parent page/node id.",
            maxLength: 120,
          },
          stateId: STATE_ID_SCHEMA,
          x: { type: "number", description: "World X." },
          y: { type: "number", description: "World Y." },
          width: { type: "string", description: "Width CSS length.", maxLength: 200 },
          height: { type: "string", description: "Height CSS length.", maxLength: 200 },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "controlId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            controlId: "n123",
            x: 40,
            y: 120,
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const controlId = readPageIdArgument(args.controlId, "controlId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const control = findControl(document, controlId);
        if (control.control?.status !== "compiled") {
          throw new ApiError(
            409,
            "CONTROL_NOT_COMPILED",
            "控件尚未编译，不能创建实例",
          );
        }
        const stateId =
          typeof args.stateId === "string" && args.stateId.trim()
            ? readPageIdArgument(args.stateId, "stateId")
            : control.control.defaultStateId;
        const state = assertStateBelongsToControl(
          document,
          controlId,
          stateId,
        );
        const parentId =
          typeof args.parentId === "string" && args.parentId.trim()
            ? readPageIdArgument(args.parentId, "parentId")
            : undefined;
        if (parentId) findPage(document, parentId);
        const instanceId = newPageId(document.pages);
        const sourceStyles = {
          ...(state.styles as Record<string, string>),
        };
        clearPositionAnchors(sourceStyles);
        const styles: Record<string, string> = {
          ...sourceStyles,
          width:
            args.width === undefined
              ? state.styles.width ?? "320px"
              : readCssLength(args.width, "width"),
          height:
            args.height === undefined
              ? state.styles.height ?? "240px"
              : readCssLength(args.height, "height"),
          "background-color": "transparent",
          "border-color": "transparent",
          "box-shadow": "none",
        };
        document.pages.push({
          id: instanceId,
          name: control.name,
          x:
            typeof args.x === "number" && Number.isFinite(args.x)
              ? args.x
              : 0,
          y:
            typeof args.y === "number" && Number.isFinite(args.y)
              ? args.y
              : 0,
          styles,
          nodeKind: "control-instance",
          controlId,
          controlStateId: stateId,
          ...(parentId ? { parentId } : {}),
        });
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return {
          instanceId,
          control: getControlSummary(
            saved.pages,
            findControl(saved, controlId),
            context.origin,
          ),
          updatedAt: saved.updatedAt,
        };
      },
    },
    {
      name: "set_control_instance_state",
      title: {
        "zh-CN": "设置控件实例状态",
        "en-US": "Set control instance state",
      },
      description: {
        "zh-CN": "设置控件实例的设计态默认状态，并同步实例尺寸。",
        "en-US": "Set an instance's design-time default state and sync its size.",
      },
      usage: {
        "zh-CN": "stateId 必须属于实例引用的控件。",
        "en-US": "stateId must belong to the instance's control.",
      },
      returns: {
        "zh-CN": "实例与 updatedAt。",
        "en-US": "The instance and updatedAt.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          instanceId: STATE_ID_SCHEMA,
          stateId: STATE_ID_SCHEMA,
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "instanceId", "stateId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            instanceId: "n789",
            stateId: "n456",
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const instanceId = readPageIdArgument(args.instanceId, "instanceId");
        const stateId = readPageIdArgument(args.stateId, "stateId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const instance = document.pages.find(
          (page) =>
            isControlInstancePage(page) && page.id === instanceId,
        );
        if (!instance || !instance.controlId) {
          throw new ApiError(
            404,
            "CONTROL_INSTANCE_NOT_FOUND",
            `控件实例 ${instanceId} 不存在`,
          );
        }
        const state = assertStateBelongsToControl(
          document,
          instance.controlId,
          stateId,
        );
        instance.controlStateId = stateId;
        instance.styles.width = state.styles.width ?? instance.styles.width;
        instance.styles.height =
          state.styles.height ?? instance.styles.height;
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return {
          instance: saved.pages.find((page) => page.id === instanceId),
          updatedAt: saved.updatedAt,
        };
      },
    },
    {
      name: "delete_control",
      title: { "zh-CN": "删除控件", "en-US": "Delete control" },
      description: {
        "zh-CN": "删除控件定义及其状态节点树。存在实例时需要 force。",
        "en-US": "Delete a control and its state trees. Existing instances require force.",
      },
      usage: {
        "zh-CN": "force=true 时同时删除引用该控件的实例。",
        "en-US": "Set force=true to also delete instances referencing the control.",
      },
      returns: {
        "zh-CN": "删除的控件 id、删除的节点数、updatedAt。",
        "en-US": "Deleted control id, removed node count, and updatedAt.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: DESTRUCTIVE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          controlId: CONTROL_ID_SCHEMA,
          force: {
            type: "boolean",
            description: "Also delete existing instances.",
            default: false,
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "controlId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            controlId: "n123",
            force: true,
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const controlId = readPageIdArgument(args.controlId, "controlId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const { instances, ids } = controlDeleteContext(
          document,
          controlId,
        );
        if (instances.length > 0 && args.force !== true) {
          throw new ApiError(
            409,
            "CONTROL_HAS_INSTANCES",
            `控件仍被 ${instances.length} 个实例使用，传入 force=true 可一并删除`,
          );
        }
        const removeIds = new Set(ids);
        for (const instance of instances) removeIds.add(instance.id);
        const removed = document.pages.filter((page) =>
          removeIds.has(page.id),
        ).length;
        document.pages = document.pages.filter(
          (page) => !removeIds.has(page.id),
        );
        document.links = document.links.filter(
          (link) =>
            !removeIds.has(link.fromId) &&
            !removeIds.has(link.toId),
        );
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return {
          controlId,
          deleted: true,
          removed,
          updatedAt: saved.updatedAt,
        };
      },
    },
    {
      name: "duplicate_control",
      title: { "zh-CN": "复制控件", "en-US": "Duplicate control" },
      description: {
        "zh-CN": "复制控件定义及其全部状态、节点与行为，生成新的控件。",
        "en-US": "Duplicate a control with all states, nodes, and behavior.",
      },
      usage: {
        "zh-CN": "新控件为 draft，默认状态会映射到新状态 id。",
        "en-US": "The copy is a draft; its default state is remapped.",
      },
      returns: {
        "zh-CN": "新控件摘要与 controlId。",
        "en-US": "New control summary and controlId.",
      },
      category: "controls",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          controlId: CONTROL_ID_SCHEMA,
          name: {
            type: "string",
            description: "Optional copy name.",
            maxLength: 160,
          },
          expectedUpdatedAt: EXPECTED_UPDATED_AT_SCHEMA,
        },
        required: ["projectId", "controlId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            controlId: "n123",
            name: "More Copy",
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const controlId = readPageIdArgument(args.controlId, "controlId");
        const document = loadCanvasForWrite(
          context.user.id,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const control = findControl(document, controlId);
        const cloned = cloneControlTree(document, control);
        const newControl = cloned.cloned.find(
          (page) => page.nodeKind === "control",
        );
        if (!newControl) {
          throw new ApiError(
            500,
            "CONTROL_DUPLICATE_FAILED",
            "控件复制失败",
          );
        }
        newControl.name =
          typeof args.name === "string" && args.name.trim()
            ? args.name.trim().slice(0, 160)
            : `${control.name} Copy`;
        newControl.control = {
          ...newControl.control!,
          status: "draft",
        };
        delete newControl.control.compiledAt;
        delete newControl.control.compiledRevision;
        delete newControl.control.compiledSig;
        document.pages.push(...cloned.pages);
        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        return {
          controlId: newControl.id,
          ...controlResult(
            saved,
            findControl(saved, newControl.id),
            context.origin,
          ),
        };
      },
    },
  ];
}

// Exported for a later delete_control implementation and shared validation.
export function controlDeleteContext(
  document: ReturnType<typeof getProjectCanvas>,
  controlId: string,
) {
  const control = findControl(document, controlId);
  const instances = getControlInstances(document.pages, controlId);
  const ids = new Set<string>([controlId]);
  for (const state of getControlStates(document.pages, controlId)) {
    for (const page of getControlStateSubtree(document.pages, state.id)) {
      ids.add(page.id);
    }
  }
  return { control, instances, ids };
}
