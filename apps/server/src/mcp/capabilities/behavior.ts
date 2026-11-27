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

const SHARED_BEHAVIOR_ID = "__project__";

const BEHAVIOR_SCHEMA = {
  type: "string" as const,
  description:
    'JSON behavior graph. Blocks are event, condition, action, switch, function, call, note, and reference. A function block uses its outgoing edges as the body. A call block sets key to that function block id and runs the body without copying the nodes. Condition edges use label "else" for the failing branch; unlabeled edges are the succeeding branch. Switch blocks read a camelCase property id in "key" and branch through edge labels "case:0" and "default". Example: {"version":2,"triggers":[],"states":[{"id":"default","name":"Default","initial":true}],"blocks":[{"id":"e1","type":"event","x":40,"y":40,"event":"click","nodeId":"button"},{"id":"a1","type":"action","x":280,"y":40,"action":{"id":"a1","type":"setStyle","targetId":"button","key":"text-align","value":"center"}}],"edges":[{"id":"edge","from":"e1","to":"a1"}]}. Every event, judgment, modification, and switch needs an explicit node id. Use "null" to clear. Legacy triggers are still accepted.',
  maxLength: 500000,
};

const TARGET_ACTION_TYPES = new Set<CanvasBehaviorActionType>([
  "setStyle",
  "setText",
  "setVisible",
  "setValue",
  "setChecked",
  "setControlState",
  "setData",
  "incrementData",
  "toggleData",
]);

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
      const bound = block.nodeId
        ? pagesById.get(block.nodeId)
        : undefined;
      if (!block.nodeId || !bound) {
        issues.push({
          severity: "error",
          code: "TARGET_MISSING",
          message: "事件块必须拖入一个存在的节点",
          pageId: page.id,
        });
      } else if (
        !block.event ||
        !getSupportedCanvasEvents(bound.widget?.kind).includes(block.event)
      ) {
        issues.push({
          severity: "error",
          code: "EVENT_UNSUPPORTED",
          message: `${bound.name} 不支持事件 ${block.event ?? ""}`,
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
    if (block.type === "switch") {
      if (!block.nodeId || !pagesById.has(block.nodeId)) {
        issues.push({
          severity: "error",
          code: "TARGET_MISSING",
          message: "分支块必须拖入一个存在的节点",
          pageId: page.id,
        });
      }
      if (!block.key?.trim()) {
        issues.push({
          severity: "error",
          code: "STYLE_KEY_INVALID",
          message: "分支块必须填写属性 ID",
          pageId: page.id,
        });
      }
    }
    if (block.type === "reference") {
      if (!block.nodeId || !pagesById.has(block.nodeId)) {
        issues.push({
          severity: "error",
          code: "TARGET_MISSING",
          message: "节点块必须引用一个存在的图层",
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
    if (block.type === "call") {
      const target = block.key
        ? behavior.blocks?.find((item) => item.id === block.key)
        : undefined;
      if (!target || target.type !== "function") {
        issues.push({
          severity: "error",
          code: "TARGET_MISSING",
          message: "调用块必须指向一个函数",
          pageId: page.id,
        });
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
    if (!allIds.has(edge.from) || !allIds.has(edge.to)) {
      issues.push({
        severity: "error",
        code: "EDGE_DANGLING",
        message: `行为连线 ${edge.id} 连接了不存在的块`,
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

  if (TARGET_ACTION_TYPES.has(action.type) && !action.targetId) {
    issues.push({
      ...base,
      severity: "error",
      code: "TARGET_MISSING",
      message: "动作必须指定目标节点",
    });
    return issues;
  }

  if (
    action.type === "setData" ||
    action.type === "incrementData" ||
    action.type === "toggleData"
  ) {
    const targetId = action.targetId ?? "";
    const target = targetId ? pagesById.get(targetId) : undefined;
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

  if (action.targetId && !pagesById.has(action.targetId)) {
    issues.push({
      ...base,
      severity: "error",
      code: "TARGET_MISSING",
      message: "目标节点不存在",
    });
    return issues;
  }
  const target = action.targetId
    ? pagesById.get(action.targetId)
    : undefined;
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
  if (action.type === "setStyle" && !action.key) {
    issues.push({
      ...base,
      severity: "error",
      code: "STYLE_KEY_INVALID",
      message: `样式属性 ${action.key ?? ""} 不能通过行为修改`,
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

  if (condition.source === "variable") {
    issues.push({
      ...base,
      severity: "warning",
      code: "VARIABLE_CONDITION_DEPRECATED",
      message: "旧变量条件会在保存时迁移为节点数据条件",
    });
    return issues;
  }

  if (condition.source !== "state" && !condition.targetId) {
    issues.push({
      ...base,
      severity: "error",
      code: "TARGET_MISSING",
      message: "条件必须指定目标节点",
    });
    return issues;
  }

  const targetId = condition.targetId ?? "";
  const target = targetId ? pagesById.get(targetId) : undefined;

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

  if (condition.source === "state") {
    if (
      target &&
      !target.behavior?.states.some(
        (state) => state.id === condition.value,
      )
    ) {
      issues.push({
        ...base,
        severity: "error",
        code: "STATE_MISSING",
        message: `${target.name} 不存在状态 ${condition.value}`,
      });
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

  if (
    condition.source === "nodeStyle" &&
    !condition.key
  ) {
    issues.push({
      ...base,
      severity: "error",
      code: "CONDITION_STYLE_KEY_INVALID",
      message: `样式条件属性 ${condition.key ?? ""} 不能通过行为读取`,
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

function readOptionalPageId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  return readPageIdArgument(value, "pageId");
}

function isProjectScope(pageId: string) {
  return pageId === "" || pageId === SHARED_BEHAVIOR_ID;
}

function projectHostPage(): CanvasPageDto {
  return {
    id: SHARED_BEHAVIOR_ID,
    name: "项目",
    x: 0,
    y: 0,
    styles: {},
  };
}

function issueCounts(issues: ValidationIssue[]) {
  return {
    issues,
    errorCount: issues.filter((item) => item.severity === "error").length,
    warningCount: issues.filter((item) => item.severity === "warning").length,
  };
}

const CURRENT_ACTION_TYPES = CANVAS_BEHAVIOR_ACTION_TYPES.filter(
  (type) => !type.endsWith("Variable"),
);
const CURRENT_CONDITION_SOURCES = CANVAS_BEHAVIOR_CONDITION_SOURCES.filter(
  (source) => source !== "variable",
);

function projectBehaviorResult(
  projectId: string,
  document: CanvasDocumentDto,
) {
  return {
    projectId,
    updatedAt: document.updatedAt,
    scope: "project" as const,
    behavior: document.behavior ?? null,
    pages: document.pages.map(pageSummary),
  };
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
    projectBehavior: document.behavior ?? null,
    actions: [...CURRENT_ACTION_TYPES],
    conditionSources: [...CURRENT_CONDITION_SOURCES],
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
          "读取项目共享行为图。事件、判断和修改都通过 nodeId 或 targetId 指向图层；空槽不会作用到任何节点。控件自己的行为图仍挂在控件定义页上。",
        "en-US":
          "Read the shared project behavior graph. Events, judgments, and modifications point at layers through nodeId or targetId; an empty slot affects no node. A control keeps its own graph on the control definition page.",
      },
      usage: {
        "zh-CN":
          "不传 pageId，或传 __project__，读取项目共享行为图，并附带各页面行为摘要。传具体 pageId 时读取该页（通常是控件）自己的行为图，同时返回 projectBehavior。",
        "en-US":
          "Omit pageId, or pass __project__, to read the shared project graph plus per-page summaries. Pass a real pageId to read that page's own graph, usually a control, and projectBehavior is included.",
      },
      returns: {
        "zh-CN": "共享或页面行为图、页面摘要、支持事件与当前动作/条件词表、updatedAt。",
        "en-US":
          "Shared or page behavior graph, page summaries, supported events, current action/condition vocabulary, and updatedAt.",
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
            description:
              "Optional page id. Omit or pass __project__ for the shared project graph.",
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
        const pageId = readOptionalPageId(args.pageId);
        if (isProjectScope(pageId)) {
          return projectBehaviorResult(projectId, document);
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
          "整体替换项目共享行为图，或替换某个控件页自己的行为图。服务端校验块、连线、事件节点和动作目标。",
        "en-US":
          "Replace the shared project behavior graph, or one control page's own graph. The server validates blocks, edges, event nodes, and action targets.",
      },
      usage: {
        "zh-CN":
          '不传 pageId 或传 __project__ 写入项目共享图。传具体 pageId 只改该页。behavior 是 JSON 字符串，传 "null" 清除。事件块要有 nodeId，判断和修改要有 targetId。建议带 expectedUpdatedAt。',
        "en-US":
          'Omit pageId or pass __project__ to write the shared project graph. A real pageId changes only that page. behavior is a JSON string; pass "null" to clear it. Event blocks need nodeId, and judgments and modifications need targetId. Send expectedUpdatedAt.',
      },
      returns: {
        "zh-CN": "更新后的行为图、updatedAt 与校验问题。",
        "en-US": "Updated behavior, updatedAt, and validation issues.",
      },
      category: "behavior",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: PROJECT_ID_SCHEMA,
          pageId: {
            ...PAGE_ID_SCHEMA,
            description:
              "Optional. Omit or pass __project__ to write the shared project graph. Pass a control page id to write that control's graph.",
          },
          behavior: BEHAVIOR_SCHEMA,
          expectedUpdatedAt: {
            type: "number",
            description:
              "Optional optimistic concurrency check. Mismatch returns 409.",
          },
        },
        required: ["projectId", "behavior"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            behavior:
              '{"version":2,"triggers":[],"states":[{"id":"default","name":"Default","initial":true}],"blocks":[{"id":"e1","type":"event","x":40,"y":40,"event":"click","nodeId":"button"},{"id":"a1","type":"action","x":280,"y":40,"action":{"id":"a1","type":"setStyle","targetId":"button","key":"background-color","value":"#2f6fed"}}],"edges":[{"id":"edge","from":"e1","to":"a1"}]}',
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const pageId = readOptionalPageId(args.pageId);
        const document = loadCanvasForWrite(
          context,
          projectId,
          readExpectedUpdatedAt(args),
        );
        const parsed = parseJsonArgument(args.behavior, "behavior");
        const behavior =
          parsed === null
            ? undefined
            : (parsed as unknown as CanvasBehaviorDto);
        if (behavior !== undefined && !isRecord(behavior)) {
          invalidArgument("behavior", "必须是 JSON 对象或 null");
        }
        if (isProjectScope(pageId)) {
          const saved = saveProjectCanvas(
            context.user.id,
            projectId,
            document.pages,
            document.links,
            behavior ?? null,
          );
          const issues = validateBehavior(
            projectHostPage(),
            saved.behavior,
            saved,
          );
          return {
            ...projectBehaviorResult(projectId, saved),
            ...issueCounts(issues),
          };
        }
        const page = findPage(document, pageId);
        if (behavior) page.behavior = behavior;
        else delete page.behavior;

        const saved = saveProjectCanvas(
          context.user.id,
          projectId,
          document.pages,
          document.links,
          document.behavior,
        );
        const savedPage = findPage(saved, pageId);
        const issues = validateBehavior(
          savedPage,
          savedPage.behavior,
          saved,
        );
        return {
          ...behaviorResult(projectId, saved, savedPage),
          ...issueCounts(issues),
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
          "校验共享行为图和页面行为图的节点引用、事件、目标和条件，不修改设计数据。",
        "en-US":
          "Validate node references, events, targets, and conditions in the shared graph and page graphs without changing the design.",
      },
      usage: {
        "zh-CN":
          "不传 pageId 时同时校验项目共享图和各页行为图。传 __project__ 只校验共享图。传 behavior JSON 可先校验草稿；不带 pageId 时草稿按共享图校验。",
        "en-US":
          "Omit pageId to validate the shared graph and every page graph. Pass __project__ for the shared graph only. Pass a behavior JSON draft to validate it first; without pageId the draft is checked as the shared graph.",
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
            description:
              "Optional page id. Omit to validate the shared graph and every page. Pass __project__ for the shared graph only.",
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
            behavior:
              '{"version":2,"triggers":[],"states":[{"id":"default","name":"Default","initial":true}],"blocks":[],"edges":[]}',
          },
        },
      ],
      async execute(context, args) {
        const projectId = readPageIdArgument(args.projectId, "projectId");
        const document = getProjectCanvas(context.user.id, projectId);
        const pageId = readOptionalPageId(args.pageId);
        const shared = isProjectScope(pageId);
        const hasDraft = args.behavior !== undefined;
        let draft: CanvasBehaviorDto | undefined;
        if (hasDraft) {
          const parsed = parseJsonArgument(args.behavior, "behavior");
          draft =
            parsed === null
              ? undefined
              : (parsed as unknown as CanvasBehaviorDto);
          if (draft !== undefined && !isRecord(draft)) {
            invalidArgument("behavior", "必须是 JSON 对象或 null");
          }
        }

        const issues: ValidationIssue[] = [];
        if (hasDraft) {
          const host = shared
            ? projectHostPage()
            : findPage(document, pageId);
          issues.push(...validateBehavior(host, draft, document));
        } else if (pageId === SHARED_BEHAVIOR_ID) {
          issues.push(
            ...validateBehavior(
              projectHostPage(),
              document.behavior,
              document,
            ),
          );
        } else if (shared) {
          issues.push(
            ...validateBehavior(
              projectHostPage(),
              document.behavior,
              document,
            ),
          );
          for (const page of document.pages) {
            issues.push(
              ...validateBehavior(page, page.behavior, document),
            );
          }
        } else {
          const page = findPage(document, pageId);
          issues.push(
            ...validateBehavior(page, page.behavior, document),
          );
        }
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
          actionTypes: [...CURRENT_ACTION_TYPES],
          legacyActionTypes: CANVAS_BEHAVIOR_ACTION_TYPES.filter((type) =>
            type.endsWith("Variable"),
          ),
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
        "zh-CN": "返回当前判断积木支持的来源、比较符和条件组模式。",
        "en-US":
          "Return the sources, operators, and group modes used by judgment blocks.",
      },
      usage: {
        "zh-CN":
          "判断块使用 condition 或 conditions。conditionMode 为 all 或 any。除 state 外都必须带 targetId。旧 variable 来源只作迁移。",
        "en-US":
          "Judgment blocks use condition or conditions. conditionMode is all or any. Every source except state requires targetId. The old variable source is migration-only.",
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
          sources: [...CURRENT_CONDITION_SOURCES],
          legacySources: ["variable"],
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
