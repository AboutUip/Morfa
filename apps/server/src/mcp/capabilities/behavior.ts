import {
  CANVAS_BEHAVIOR_ACTION_TYPES,
  CANVAS_BEHAVIOR_CONDITION_OPERATORS,
  CANVAS_BEHAVIOR_CONDITION_SOURCES,
  CANVAS_BEHAVIOR_STYLE_KEYS,
  getSupportedCanvasEvents,
} from "@morfa/shared/canvas-behavior";

import { ApiError } from "../../lib/errors.js";
import {
  getProjectCanvas,
  saveProjectCanvas,
  type CanvasBehaviorActionDto,
  type CanvasBehaviorActionType,
  type CanvasBehaviorConditionDto,
  type CanvasBehaviorConditionOperator,
  type CanvasBehaviorConditionSource,
  type CanvasBehaviorDto,
  type CanvasBehaviorTriggerDto,
  type CanvasDocumentDto,
  type CanvasPageDto,
} from "../../services/canvasDocuments.js";
import {
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
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

const BEHAVIOR_SCHEMA = {
  type: "string" as const,
  description:
    'JSON object with triggers, states and variables, for example {"triggers":[{"id":"t1","event":"click","actions":[{"id":"a1","type":"navigate","pageId":"home"}]}],"states":[{"id":"default","name":"Default","initial":true}],"variables":[]}. Use "null" to clear the behavior.',
  maxLength: 500000,
};

const TEXT_KINDS = new Set([
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
  "image",
  "video",
  "avatar",
  "badge",
  "card",
  "tabs",
  "alert",
  "chart",
]);

const VALUE_KINDS = new Set(["progress", "slider"]);
const CHECKED_KINDS = new Set(["checkbox", "radio", "toggle"]);
function invalidArgument(field: string, message: string): never {
  throw new ApiError(400, "MCP_INVALID_ARGUMENTS", `参数 ${field} ${message}`);
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

function readPageIdArgument(value: unknown, field: string): string {
  if (typeof value !== "string") invalidArgument(field, "必须是字符串");
  const id = value.trim();
  if (!id || id.length > 120) invalidArgument(field, "不是合法的页面 id");
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

function findPage(document: CanvasDocumentDto, pageId: string) {
  const page = document.pages.find((item) => item.id === pageId);
  if (!page) {
    throw new ApiError(404, "CANVAS_PAGE_NOT_FOUND", `页面 ${pageId} 不存在`);
  }
  return page;
}

function pageSummary(page: CanvasPageDto) {
  return {
    id: page.id,
    name: page.name,
    widgetKind: page.widget?.kind ?? null,
    parentId: page.parentId ?? null,
    nodeKind: page.nodeKind ?? "page",
    behavior: page.behavior
      ? {
          version: page.behavior.version ?? 1,
          triggers: page.behavior.triggers.length,
          states: page.behavior.states.length,
          blocks: page.behavior.blocks?.length ?? 0,
          edges: page.behavior.edges?.length ?? 0,
        }
      : null,
  };
}

interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  pageId?: string;
  triggerId?: string;
  actionId?: string;
  conditionId?: string;
}

function validateBehavior(
  page: CanvasPageDto,
  behavior: CanvasBehaviorDto | undefined,
  document: CanvasDocumentDto,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!behavior) return issues;

  const triggers = Array.isArray(behavior.triggers)
    ? behavior.triggers
    : [];
  const states = Array.isArray(behavior.states) ? behavior.states : [];
  if (
    !Array.isArray(behavior.triggers) ||
    !Array.isArray(behavior.states) ||
    (behavior.blocks !== undefined && !Array.isArray(behavior.blocks)) ||
    (behavior.edges !== undefined && !Array.isArray(behavior.edges))
  ) {
    issues.push({
      severity: "error",
      code: "BEHAVIOR_STRUCTURE_INVALID",
      message: "行为图必须包含 triggers、states 数组，blocks/edges 必须为数组",
      pageId: page.id,
    });
  }

  const pagesById = new Map(document.pages.map((item) => [item.id, item]));
  const stateIds = new Set(
    states
      .filter((state) => state && typeof state.id === "string")
      .map((state) => state.id),
  );
  const supportedEvents = new Set(getSupportedCanvasEvents(page.widget?.kind));
  const initialStates = states.filter((state) => state?.initial);

  if (states.length > 0 && initialStates.length === 0) {
    issues.push({
      severity: "error",
      code: "INITIAL_STATE_MISSING",
      message: "行为图没有初始状态",
      pageId: page.id,
    });
  }
  if (initialStates.length > 1) {
    issues.push({
      severity: "error",
      code: "INITIAL_STATE_MULTIPLE",
      message: "存在多个初始状态",
      pageId: page.id,
    });
  }

  const blocks = Array.isArray(behavior.blocks) ? behavior.blocks : [];
  const edges = Array.isArray(behavior.edges) ? behavior.edges : [];
  const referencedStateIds = new Set(initialStates.map((state) => state.id));
  for (const trigger of triggers) {
    if (trigger?.stateId) referencedStateIds.add(trigger.stateId);
    for (const action of trigger?.actions ?? []) {
      if (action?.type === "setState" && action.value) {
        referencedStateIds.add(action.value);
      }
    }
  }
  for (const block of blocks) {
    if (block?.stateId) referencedStateIds.add(block.stateId);
    if (block?.action?.type === "setState" && block.action.value) {
      referencedStateIds.add(block.action.value);
    }
  }
  for (const edge of edges) {
    if (stateIds.has(edge.to)) referencedStateIds.add(edge.to);
  }
  for (const state of states) {
    if (!state?.id || referencedStateIds.has(state.id)) continue;
    issues.push({
      severity: "warning",
      code: "STATE_UNREACHABLE",
      message: `状态 ${state.name ?? state.id} 没有触发器或转移`,
      pageId: page.id,
    });
  }

  const triggerIds = new Set<string>();
  for (const trigger of triggers) {
    if (!trigger || typeof trigger.id !== "string") {
      issues.push({
        severity: "error",
        code: "TRIGGER_INVALID",
        message: "触发器缺少合法 id",
        pageId: page.id,
      });
      continue;
    }
    if (triggerIds.has(trigger.id)) {
      issues.push({
        severity: "error",
        code: "TRIGGER_DUPLICATE",
        message: `触发器 ${trigger.id} 重复`,
        pageId: page.id,
        triggerId: trigger.id,
      });
    }
    triggerIds.add(trigger.id);

    if (!supportedEvents.has(trigger.event)) {
      issues.push({
        severity: "error",
        code: "EVENT_UNSUPPORTED",
        message: `当前组件不支持事件 ${trigger.event}`,
        pageId: page.id,
        triggerId: trigger.id,
      });
    }
    if (trigger.stateId && !stateIds.has(trigger.stateId)) {
      issues.push({
        severity: "error",
        code: "STATE_MISSING",
        message: `状态 ${trigger.stateId} 不存在`,
        pageId: page.id,
        triggerId: trigger.id,
      });
    }
    const actions = Array.isArray(trigger.actions) ? trigger.actions : [];
    const conditions = Array.isArray(trigger.conditions)
      ? trigger.conditions
      : [];
    if (actions.length === 0) {
      issues.push({
        severity: "warning",
        code: "TRIGGER_EMPTY",
        message: "触发器没有动作",
        pageId: page.id,
        triggerId: trigger.id,
      });
    }

    const actionIds = new Set<string>();
    for (const action of actions) {
      if (!action || typeof action.id !== "string") {
        issues.push({
          severity: "error",
          code: "ACTION_INVALID",
          message: "动作缺少合法 id",
          pageId: page.id,
          triggerId: trigger.id,
        });
        continue;
      }
      if (actionIds.has(action.id)) {
        issues.push({
          severity: "error",
          code: "ACTION_DUPLICATE",
          message: `动作 ${action.id} 重复`,
          pageId: page.id,
          triggerId: trigger.id,
          actionId: action.id,
        });
      }
      actionIds.add(action.id);
      issues.push(
        ...validateAction(
          page,
          action,
          pagesById,
          stateIds,
          trigger,
        ),
      );
    }

    const conditionIds = new Set<string>();
    for (const condition of conditions) {
      if (!condition || typeof condition.id !== "string") {
        issues.push({
          severity: "error",
          code: "CONDITION_INVALID",
          message: "条件缺少合法 id",
          pageId: page.id,
          triggerId: trigger.id,
        });
        continue;
      }
      if (conditionIds.has(condition.id)) {
        issues.push({
          severity: "error",
          code: "CONDITION_DUPLICATE",
          message: `条件 ${condition.id} 重复`,
          pageId: page.id,
          triggerId: trigger.id,
          conditionId: condition.id,
        });
      }
      conditionIds.add(condition.id);
      issues.push(
        ...validateCondition(
          page,
          condition,
          pagesById,
          trigger,
        ),
      );
    }
  }

  const blockIds = new Set<string>();
  for (const block of blocks) {
    if (!block || typeof block.id !== "string") {
      issues.push({
        severity: "error",
        code: "BLOCK_INVALID",
        message: "行为块缺少合法 id",
        pageId: page.id,
      });
      continue;
    }
    if (stateIds.has(block.id) || blockIds.has(block.id)) {
      issues.push({
        severity: "error",
        code: "BLOCK_DUPLICATE",
        message: `行为块 ${block.id} 与状态或其他块重复`,
        pageId: page.id,
      });
    }
    blockIds.add(block.id);
    if (block.type === "event") {
      if (!block.event || !supportedEvents.has(block.event)) {
        issues.push({
          severity: "error",
          code: "EVENT_UNSUPPORTED",
          message: `当前组件不支持事件 ${block.event ?? ""}`,
          pageId: page.id,
        });
      }
      if (block.stateId && !stateIds.has(block.stateId)) {
        issues.push({
          severity: "error",
          code: "STATE_MISSING",
          message: `事件块引用了不存在的状态 ${block.stateId}`,
          pageId: page.id,
        });
      }
    }
    if (block.type === "condition") {
      const conditions =
        block.conditions && block.conditions.length > 0
          ? block.conditions
          : block.condition
            ? [block.condition]
            : [];
      if (conditions.length === 0) {
        issues.push({
          severity: "error",
          code: "CONDITION_MISSING",
          message: "条件块缺少条件配置",
          pageId: page.id,
        });
      } else {
        for (const condition of conditions) {
          issues.push(
            ...validateCondition(
              page,
              condition,
              pagesById,
              {
                id: block.id,
                event: "graph",
                actions: [],
              },
            ),
          );
        }
      }
    }
    if (block.type === "action") {
      if (!block.action) {
        issues.push({
          severity: "error",
          code: "ACTION_MISSING",
          message: "动作块缺少动作配置",
          pageId: page.id,
        });
      } else {
        issues.push(
          ...validateAction(
            page,
            block.action,
            pagesById,
            stateIds,
            {
              id: block.id,
              event: "graph",
              actions: [],
            },
          ),
        );
      }
    }
  }

  const allIds = new Set([...stateIds, ...blockIds]);
  const edgeIds = new Set<string>();
  const outgoing = new Set<string>();
  for (const edge of edges) {
    if (!edge || typeof edge.id !== "string") {
      issues.push({
        severity: "error",
        code: "EDGE_INVALID",
        message: "行为连线缺少合法 id",
        pageId: page.id,
      });
      continue;
    }
    if (edgeIds.has(edge.id)) {
      issues.push({
        severity: "error",
        code: "EDGE_DUPLICATE",
        message: `行为连线 ${edge.id} 重复`,
        pageId: page.id,
      });
    }
    edgeIds.add(edge.id);
    outgoing.add(edge.from);
    if (!allIds.has(edge.from) || !allIds.has(edge.to)) {
      issues.push({
        severity: "error",
        code: "EDGE_DANGLING",
        message: `行为连线 ${edge.id} 连接了不存在的块`,
        pageId: page.id,
      });
    }
  }
  for (const block of blocks) {
    if (
      block &&
      (block.type === "event" ||
        block.type === "condition" ||
        block.type === "action") &&
      !outgoing.has(block.id)
    ) {
      issues.push({
        severity: "warning",
        code: "BLOCK_NO_OUTGOING",
        message: `行为块 ${block.id} 没有后续连线`,
        pageId: page.id,
      });
    }
  }

  return issues;
}

function validateAction(
  page: CanvasPageDto,
  action: CanvasBehaviorActionDto,
  pagesById: Map<string, CanvasPageDto>,
  stateIds: Set<string>,
  trigger: CanvasBehaviorTriggerDto,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const base = {
    pageId: page.id,
    triggerId: trigger.id,
    actionId: action.id,
  };

  if (
    !CANVAS_BEHAVIOR_ACTION_TYPES.includes(
      action.type as (typeof CANVAS_BEHAVIOR_ACTION_TYPES)[number],
    )
  ) {
    issues.push({
      ...base,
      severity: "error",
      code: "ACTION_TYPE_UNKNOWN",
      message: `未知动作类型 ${action.type}`,
    });
    return issues;
  }

  if (action.type === "navigate") {
    if (!action.pageId || !pagesById.has(action.pageId)) {
      issues.push({
        ...base,
        severity: "error",
        code: "PAGE_MISSING",
        message: "目标页面不存在",
      });
    }
    return issues;
  }

  if (action.type === "setState") {
    if (!action.value || !stateIds.has(action.value)) {
      issues.push({
        ...base,
        severity: "error",
        code: "STATE_MISSING",
        message: `状态 ${action.value ?? ""} 不存在`,
      });
    }
    return issues;
  }

  if (
    action.type === "setData" ||
    action.type === "incrementData" ||
    action.type === "toggleData"
  ) {
    const targetId = action.targetId ?? page.id;
    const target = pagesById.get(targetId);
    const dataEntry = target?.data?.find(
      (entry) => entry.key === action.key,
    );
    if (!target || !action.key || !dataEntry) {
      issues.push({
        ...base,
        severity: "error",
        code: "DATA_KEY_MISSING",
        message: `节点数据 ${action.key ?? ""} 未在 ${target?.name ?? targetId} 声明`,
      });
      return issues;
    }
    if (action.type === "incrementData" && dataEntry.type !== "number") {
      issues.push({
        ...base,
        severity: "error",
        code: "DATA_TYPE_MISMATCH",
        message: `节点数据 ${action.key} 不是 number 类型`,
      });
    }
    if (action.type === "toggleData" && dataEntry.type !== "boolean") {
      issues.push({
        ...base,
        severity: "error",
        code: "DATA_TYPE_MISMATCH",
        message: `节点数据 ${action.key} 不是 boolean 类型`,
      });
    }
    return issues;
  }

  if (
    action.type === "setVariable" ||
    action.type === "incrementVariable" ||
    action.type === "toggleVariable"
  ) {
    issues.push({
      ...base,
      severity: "warning",
      code: "VARIABLE_ACTION_DEPRECATED",
      message: "旧变量动作会在保存时迁移为节点数据动作",
    });
    return issues;
  }

  if (!action.targetId || !pagesById.has(action.targetId)) {
    issues.push({
      ...base,
      severity: "error",
      code: "TARGET_MISSING",
      message: "目标节点不存在",
    });
    return issues;
  }
  const target = pagesById.get(action.targetId);
  if (!target) return issues;

  if (action.type === "setText" && (!target.widget || !TEXT_KINDS.has(target.widget.kind))) {
    issues.push({
      ...base,
      severity: "error",
      code: "TARGET_UNSUPPORTED",
      message: `${target.name} 不支持 setText`,
    });
  }
  if (action.type === "setValue" && (!target.widget || !VALUE_KINDS.has(target.widget.kind))) {
    issues.push({
      ...base,
      severity: "error",
      code: "TARGET_UNSUPPORTED",
      message: `${target.name} 不支持 setValue`,
    });
  }
  if (
    action.type === "setChecked" &&
    (!target.widget || !CHECKED_KINDS.has(target.widget.kind))
  ) {
    issues.push({
      ...base,
      severity: "error",
      code: "TARGET_UNSUPPORTED",
      message: `${target.name} 不支持 setChecked`,
    });
  }
  if (
    action.type === "setStyle" &&
    (!action.key ||
      !CANVAS_BEHAVIOR_STYLE_KEYS.includes(
        action.key as (typeof CANVAS_BEHAVIOR_STYLE_KEYS)[number],
      ))
  ) {
    issues.push({
      ...base,
      severity: "error",
      code: "STYLE_KEY_INVALID",
      message: `样式属性 ${action.key ?? ""} 不在白名单内`,
    });
  }

  return issues;
}

function validateCondition(
  page: CanvasPageDto,
  condition: CanvasBehaviorConditionDto,
  pagesById: Map<string, CanvasPageDto>,
  trigger: CanvasBehaviorTriggerDto,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const base = {
    pageId: page.id,
    triggerId: trigger.id,
    conditionId: condition.id,
  };

  if (
    !CANVAS_BEHAVIOR_CONDITION_SOURCES.includes(
      condition.source as CanvasBehaviorConditionSource,
    )
  ) {
    issues.push({
      ...base,
      severity: "error",
      code: "CONDITION_SOURCE_UNKNOWN",
      message: `未知条件来源 ${condition.source}`,
    });
    return issues;
  }
  if (
    !CANVAS_BEHAVIOR_CONDITION_OPERATORS.includes(
      condition.operator as CanvasBehaviorConditionOperator,
    )
  ) {
    issues.push({
      ...base,
      severity: "error",
      code: "CONDITION_OPERATOR_UNKNOWN",
      message: `未知比较符 ${condition.operator}`,
    });
    return issues;
  }

  const targetId = condition.targetId ?? page.id;
  const target = pagesById.get(targetId);

  if (condition.source === "variable") {
    issues.push({
      ...base,
      severity: "warning",
      code: "VARIABLE_CONDITION_DEPRECATED",
      message: "旧变量条件会在保存时迁移为节点数据条件",
    });
    return issues;
  }

  if (condition.source === "nodeData" || condition.source === "controlState") {
    if (!target) {
      issues.push({
        ...base,
        severity: "error",
        code: "TARGET_MISSING",
        message: `条件目标 ${targetId} 不存在`,
      });
      return issues;
    }
    if (condition.source === "nodeData") {
      if (!condition.key || !target.data?.some((entry) => entry.key === condition.key)) {
        issues.push({
          ...base,
          severity: "error",
          code: "DATA_KEY_MISSING",
          message: `节点数据 ${condition.key ?? ""} 未在 ${target.name} 声明`,
        });
      }
      return issues;
    }
    return issues;
  }

  if (!target) {
    issues.push({
      ...base,
      severity: "error",
      code: "TARGET_MISSING",
      message: `条件目标 ${targetId} 不存在`,
    });
    return issues;
  }

  if (condition.source === "state") {
    const stateExists = target.behavior?.states.some(
      (state) => state.id === condition.value,
    );
    if (!stateExists) {
      issues.push({
        ...base,
        severity: "error",
        code: "STATE_MISSING",
        message: `${target.name} 不存在状态 ${condition.value}`,
      });
    }
  }

  if (
    condition.source === "nodeStyle" &&
    (!condition.key ||
      !CANVAS_BEHAVIOR_STYLE_KEYS.includes(
        condition.key as (typeof CANVAS_BEHAVIOR_STYLE_KEYS)[number],
      ))
  ) {
    issues.push({
      ...base,
      severity: "error",
      code: "CONDITION_STYLE_KEY_INVALID",
      message: `样式条件属性 ${condition.key ?? ""} 不在白名单内`,
    });
  }

  if (
    condition.source === "nodeVisible" &&
    condition.value !== "true" &&
    condition.value !== "false"
  ) {
    issues.push({
      ...base,
      severity: "error",
      code: "CONDITION_VALUE_INVALID",
      message: "节点可见性条件只能比较 true 或 false",
    });
  }

  if (
    (condition.operator === "gt" ||
      condition.operator === "gte" ||
      condition.operator === "lt" ||
      condition.operator === "lte") &&
    !Number.isFinite(Number.parseFloat(condition.value))
  ) {
    issues.push({
      ...base,
      severity: "warning",
      code: "CONDITION_NUMERIC",
      message: "大小比较需要数字比较值",
    });
  }

  return issues;
}

function behaviorResult(
  projectId: string,
  document: CanvasDocumentDto,
  page: CanvasPageDto,
) {
  return {
    projectId,
    updatedAt: document.updatedAt,
    pageId: page.id,
    pageName: page.name,
    nodeKind: page.nodeKind ?? "page",
    data: page.data ?? [],
    behavior: page.behavior ?? null,
    supportedEvents: [...getSupportedCanvasEvents(page.widget?.kind)],
    actions: [...CANVAS_BEHAVIOR_ACTION_TYPES],
    conditionSources: [...CANVAS_BEHAVIOR_CONDITION_SOURCES],
    conditionOperators: [...CANVAS_BEHAVIOR_CONDITION_OPERATORS],
  };
}

export function behaviorCapabilities(): McpCapability[] {
  return [
    {
      name: "get_behavior",
      title: {
        "zh-CN": "读取行为图",
        "en-US": "Get behavior graph",
      },
      description: {
        "zh-CN":
          "读取一个页面节点的行为触发器、状态、变量、支持的事件以及当前动作与条件词表。",
        "en-US":
          "Read a node's behavior triggers, states, variables, supported events, and the current action/condition vocabulary.",
      },
      usage: {
        "zh-CN":
          "不传 pageId 时返回项目中所有节点的行为摘要。variables 是跨项目聚合的运行时变量。",
        "en-US":
          "Omit pageId to list behavior summaries for every node. variables are aggregated project-wide runtime variables.",
      },
      returns: {
        "zh-CN": "页面行为图、变量、支持事件、updatedAt。",
        "en-US":
          "Page behavior graph, variables, supported events, and updatedAt.",
      },
      category: "behavior",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: {
            ...PAGE_ID_SCHEMA,
            description: "Optional page id. Omit to list all behaviors.",
          },
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [
        { arguments: { projectId: "project-uuid", pageId: "n1a2b3c4" } },
        { arguments: { projectId: "project-uuid" } },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const document = getProjectCanvas(context.user.id, projectId);
        const pageId =
          typeof args.pageId === "string" && args.pageId.trim()
            ? readPageIdArgument(args.pageId, "pageId")
            : "";
        if (!pageId) {
          return {
            projectId,
            updatedAt: document.updatedAt,
            pages: document.pages.map(pageSummary),
          };
        }
        return behaviorResult(
          projectId,
          document,
          findPage(document, pageId),
        );
      },
    },
    {
      name: "update_behavior",
      title: {
        "zh-CN": "更新行为图",
        "en-US": "Update behavior graph",
      },
      description: {
        "zh-CN":
          "整体替换或清除一个页面节点的行为图。服务端会校验行为结构、引用和动作参数。",
        "en-US":
          "Replace or clear a node's behavior graph. The server validates structure, references, and action arguments.",
      },
      usage: {
        "zh-CN":
          'behavior 是 JSON 字符串；传 "null" 清除。建议先 get_behavior 并用 expectedUpdatedAt 防冲突。',
        "en-US":
          'behavior is a JSON string; pass "null" to clear it. Read get_behavior first and use expectedUpdatedAt to avoid conflicts.',
      },
      returns: {
        "zh-CN": "更新后的行为图、聚合变量、updatedAt 与校验问题。",
        "en-US":
          "Updated behavior, aggregated variables, updatedAt, and validation issues.",
      },
      category: "behavior",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          behavior: BEHAVIOR_SCHEMA,
          expectedUpdatedAt: {
            type: "number",
            description:
              "Optional optimistic concurrency check. Mismatch returns 409.",
          },
        },
        required: ["projectId", "pageId", "behavior"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            pageId: "n1a2b3c4",
            behavior:
              '{"triggers":[{"id":"t1","event":"click","actions":[{"id":"a1","type":"navigate","pageId":"home"}]}],"states":[{"id":"default","name":"Default","initial":true}],"variables":[]}',
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const pageId = readPageIdArgument(args.pageId, "pageId");
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const page = findPage(document, pageId);
        const parsed = parseJsonArgument(args.behavior, "behavior");
        const behavior =
          parsed === null
            ? undefined
            : (parsed as unknown as CanvasBehaviorDto);
        if (behavior !== undefined && !isRecord(behavior)) {
          invalidArgument("behavior", "必须是 JSON 对象或 null");
        }
        if (behavior) page.behavior = behavior;
        else delete page.behavior;

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
        );
        const savedPage = findPage(saved, pageId);
        const issues = validateBehavior(
          savedPage,
          savedPage.behavior,
          saved,
        );
        return {
          ...behaviorResult(projectId, saved, savedPage),
          issues,
          errorCount: issues.filter((item) => item.severity === "error")
            .length,
          warningCount: issues.filter((item) => item.severity === "warning")
            .length,
        };
      },
    },
    {
      name: "validate_behavior",
      title: {
        "zh-CN": "校验行为图",
        "en-US": "Validate behavior graph",
      },
      description: {
        "zh-CN":
          "校验项目内的行为引用、事件支持、状态、变量、目标节点和条件，不修改设计数据。",
        "en-US":
          "Validate behavior references, supported events, states, variables, target nodes, and conditions without changing the design.",
      },
      usage: {
        "zh-CN":
          "可选 pageId 仅校验一个页面；传入 behavior JSON 可先校验未保存的草稿。",
        "en-US":
          "Optionally validate a single page; pass a behavior JSON draft to validate it before saving.",
      },
      returns: {
        "zh-CN": "问题列表、错误/警告数量、updatedAt。",
        "en-US": "Issue list, error/warning counts, and updatedAt.",
      },
      category: "behavior",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: {
            ...PAGE_ID_SCHEMA,
            description: "Optional page id. Omit to validate every behavior.",
          },
          behavior: {
            ...BEHAVIOR_SCHEMA,
            description:
              "Optional unsaved behavior draft. Requires pageId. Use null to validate the cleared state.",
          },
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
            behavior: '{"triggers":[],"states":[],"variables":[]}',
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const document = getProjectCanvas(context.user.id, projectId);
        const pageId =
          typeof args.pageId === "string" && args.pageId.trim()
            ? readPageIdArgument(args.pageId, "pageId")
            : "";
        const hasDraft = args.behavior !== undefined;
        let draft: CanvasBehaviorDto | undefined;
        if (hasDraft) {
          if (!pageId) invalidArgument("pageId", "在传入 behavior 时必填");
          const parsed = parseJsonArgument(args.behavior, "behavior");
          draft =
            parsed === null
              ? undefined
              : (parsed as unknown as CanvasBehaviorDto);
          if (draft !== undefined && !isRecord(draft)) {
            invalidArgument("behavior", "必须是 JSON 对象或 null");
          }
        }

        const pages = pageId ? [findPage(document, pageId)] : document.pages;
        const issues = pages.flatMap((page) =>
          validateBehavior(
            page,
            hasDraft ? draft : page.behavior,
            document,
          ),
        );
        return {
          projectId,
          updatedAt: document.updatedAt,
          ok: !issues.some((item) => item.severity === "error"),
          errorCount: issues.filter((item) => item.severity === "error")
            .length,
          warningCount: issues.filter((item) => item.severity === "warning")
            .length,
          issues,
        };
      },
    },
    {
      name: "list_supported_events",
      title: {
        "zh-CN": "列出支持的事件",
        "en-US": "List supported events",
      },
      description: {
        "zh-CN":
          "返回所有组件类型支持的事件；传 widgetKind 或 pageId 可查看单个组件。",
        "en-US":
          "Return events supported by every widget kind; pass widgetKind or pageId for one widget.",
      },
      usage: {
        "zh-CN": "pageId 会读取该节点的组件类型；widgetKind 可直接指定类型。",
        "en-US":
          "pageId reads the node's widget kind; widgetKind selects a kind directly.",
      },
      returns: {
        "zh-CN": "按组件类型分组的事件列表或单个组件的事件列表。",
        "en-US":
          "Event lists grouped by widget kind, or the events for one widget.",
      },
      category: "behavior",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: PAGE_ID_SCHEMA,
          widgetKind: {
            type: "string",
            description:
              "Optional widget kind such as button, input, checkbox, chart.",
          },
        },
        required: ["projectId"],
        additionalProperties: false,
      },
      examples: [
        { arguments: { projectId: "project-uuid" } },
        { arguments: { projectId: "project-uuid", pageId: "n1a2b3c4" } },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const document = getProjectCanvas(context.user.id, projectId);
        if (typeof args.pageId === "string" && args.pageId.trim()) {
          const page = findPage(
            document,
            readPageIdArgument(args.pageId, "pageId"),
          );
          return {
            projectId,
            pageId: page.id,
            widgetKind: page.widget?.kind ?? null,
            events: [...getSupportedCanvasEvents(page.widget?.kind)],
          };
        }
        if (typeof args.widgetKind === "string" && args.widgetKind.trim()) {
          const kind = args.widgetKind.trim();
          return {
            projectId,
            widgetKind: kind,
            events: [...getSupportedCanvasEvents(kind)],
          };
        }
        return {
          projectId,
          base: [...getSupportedCanvasEvents(null)],
          widgets: Object.fromEntries(
            document.pages
              .map((page) => page.widget?.kind)
              .filter(
                (
                  kind,
                ): kind is NonNullable<
                  CanvasPageDto["widget"]
                >["kind"] => Boolean(kind),
              )
              .map((kind) => [kind, [...getSupportedCanvasEvents(kind)]]),
          ),
        };
      },
    },
    {
      name: "list_actions",
      title: {
        "zh-CN": "列出行为动作",
        "en-US": "List behavior actions",
      },
      description: {
        "zh-CN": "返回行为编辑器支持的全部动作类型及其参数要求。",
        "en-US":
          "Return every action type supported by the behavior editor and its argument requirements.",
      },
      usage: {
        "zh-CN": "无需参数，适合 Agent 生成行为图前读取。",
        "en-US":
          "Takes no arguments. Useful before generating a behavior graph.",
      },
      returns: {
        "zh-CN": "动作类型、是否需要目标节点、是否需要值。",
        "en-US":
          "Action types, whether they need a target node, and whether they need a value.",
      },
      category: "behavior",
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
      async execute() {
        return {
          actions: [
            { type: "navigate", needsTarget: false, needsValue: false, config: ["pageId"] },
            { type: "setStyle", needsTarget: true, needsValue: true, config: ["targetId", "key", "value"] },
            { type: "setText", needsTarget: true, needsValue: true, config: ["targetId", "value"] },
            { type: "setVisible", needsTarget: true, needsValue: true, config: ["targetId", "value"] },
            { type: "setValue", needsTarget: true, needsValue: true, config: ["targetId", "value"] },
            { type: "setChecked", needsTarget: true, needsValue: true, config: ["targetId", "value"] },
            { type: "setState", needsTarget: false, needsValue: true, config: ["value"] },
            { type: "setControlState", needsTarget: true, needsValue: true, config: ["targetId", "value"] },
            { type: "setData", needsTarget: true, needsValue: true, config: ["targetId", "key", "value"] },
            { type: "incrementData", needsTarget: true, needsValue: true, config: ["targetId", "key", "value"] },
            { type: "toggleData", needsTarget: true, needsValue: false, config: ["targetId", "key"] },
          ],
          styleKeys: [...CANVAS_BEHAVIOR_STYLE_KEYS],
          actionTypes: [...CANVAS_BEHAVIOR_ACTION_TYPES],
        };
      },
    },
    {
      name: "list_conditions",
      title: {
        "zh-CN": "列出行为条件",
        "en-US": "List behavior conditions",
      },
      description: {
        "zh-CN": "返回行为条件支持的来源、比较符与触发条件模式。",
        "en-US":
          "Return condition sources, operators, and trigger condition modes.",
      },
      usage: {
        "zh-CN": "条件保存在 trigger.conditions，conditionMode 为 all 或 any。",
        "en-US":
          "Conditions live in trigger.conditions; conditionMode is all or any.",
      },
      returns: {
        "zh-CN": "条件来源、比较符与模式。",
        "en-US": "Condition sources, operators, and modes.",
      },
      category: "behavior",
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
      async execute() {
        return {
          sources: [...CANVAS_BEHAVIOR_CONDITION_SOURCES],
          operators: [...CANVAS_BEHAVIOR_CONDITION_OPERATORS],
          modes: ["all", "any"],
          sourcesDetail: [
            { source: "nodeData", config: ["targetId", "key", "operator", "value", "negate"] },
            { source: "state", config: ["targetId", "operator", "value"] },
            { source: "controlState", config: ["targetId", "operator", "value"] },
            { source: "nodeVisible", config: ["targetId", "operator", "value"] },
            { source: "nodeText", config: ["targetId", "operator", "value"] },
            { source: "nodeValue", config: ["targetId", "operator", "value"] },
            {
              source: "nodeStyle",
              config: ["targetId", "key", "operator", "value"],
            },
          ],
        };
      },
    },
  ];
}
