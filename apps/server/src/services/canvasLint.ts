import type { CanvasLayoutIssue } from "@morfa/shared/canvas-layout";
import { getSupportedCanvasEvents } from "@morfa/shared/canvas-behavior";

import type {
  CanvasBehaviorActionDto,
  CanvasBehaviorActionType,
  CanvasDocumentDto,
  CanvasPageDto,
} from "./canvasDocuments.js";
import {
  collectLayoutIssues,
  resolvePageFrames,
} from "./canvasFrames.js";

export type CanvasLintSeverity = "error" | "warning";

export interface CanvasLintItem {
  severity: CanvasLintSeverity;
  code: string;
  pageId: string | null;
  pageName?: string | null;
  message: string;
  linkId?: string;
  triggerId?: string;
  actionId?: string;
  pageIds?: string[];
}

export interface CanvasLintSummary {
  errors: number;
  warnings: number;
  total: number;
  byCode: Record<string, number>;
}

export interface CanvasLintResult {
  items: CanvasLintItem[];
  errors: CanvasLintItem[];
  warnings: CanvasLintItem[];
  summary: CanvasLintSummary;
}

export interface CanvasLintOptions {
  /** Restrict the returned items to these page ids (subtree filter). */
  pageIds?: Set<string>;
}

const BEHAVIOR_ACTION_TYPES = new Set<CanvasBehaviorActionType>([
  "navigate",
  "setStyle",
  "setText",
  "setVisible",
  "setValue",
  "setChecked",
  "setState",
  "setControlState",
  "setData",
  "incrementData",
  "toggleData",
  "apply",
  "setVariable",
  "incrementVariable",
  "toggleVariable",
]);

const TARGET_ACTION_TYPES = new Set<string>([
  "setStyle",
  "setText",
  "setVisible",
  "setValue",
  "setChecked",
  "setControlState",
]);

const DATA_ACTION_TYPES = new Set<string>([
  "setData",
  "incrementData",
  "toggleData",
]);

function layoutIssueCode(issue: CanvasLayoutIssue) {
  switch (issue.code) {
    case "parent-missing":
      return "PARENT_MISSING";
    case "parent-cycle":
      return "PARENT_CYCLE";
    case "negative-size":
      return "LAYOUT_NEGATIVE_SIZE";
    case "percent-without-reference":
      return "LAYOUT_PERCENT_WITHOUT_REFERENCE";
    default:
      return "LAYOUT_INVALID_LENGTH";
  }
}

export function summarizeLintItems(
  items: CanvasLintItem[],
): CanvasLintSummary {
  const byCode: Record<string, number> = {};
  let errors = 0;
  let warnings = 0;

  for (const item of items) {
    byCode[item.code] = (byCode[item.code] ?? 0) + 1;
    if (item.severity === "error") errors += 1;
    else warnings += 1;
  }

  return {
    errors,
    warnings,
    total: items.length,
    byCode,
  };
}

export function lintCanvas(
  document: CanvasDocumentDto,
  options: CanvasLintOptions = {},
): CanvasLintResult {
  const items: CanvasLintItem[] = [];
  const seen = new Set<string>();
  const pagesById = new Map(
    document.pages.map((page) => [page.id, page]),
  );
  const frames = resolvePageFrames(document.pages, document.links);

  const push = (item: CanvasLintItem) => {
    const key = [
      item.severity,
      item.code,
      item.pageId ?? "",
      item.message,
    ].join(":");
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  const pageName = (pageId: string | null | undefined) =>
    pageId ? pagesById.get(pageId)?.name ?? null : null;

  // 1. Layout resolver issues. parent-missing / parent-cycle are reported
  // explicitly below so the rest of the resolver issues are mapped here.
  for (const issue of collectLayoutIssues(frames)) {
    if (issue.code === "parent-missing" || issue.code === "parent-cycle") {
      continue;
    }
    push({
      severity: issue.severity,
      code: layoutIssueCode(issue),
      pageId: issue.nodeId,
      pageName: pageName(issue.nodeId),
      message: issue.message,
    });
  }

  // 2. Hierarchy + link integrity.
  for (const page of document.pages) {
    if (page.parentId && !pagesById.has(page.parentId)) {
      push({
        severity: "error",
        code: "PARENT_MISSING",
        pageId: page.id,
        pageName: page.name,
        message: `页面「${page.name}」的父页面 ${page.parentId} 不存在`,
      });
    }
  }
  for (const frame of frames.values()) {
    if (frame.issues.some((issue) => issue.code === "parent-cycle")) {
      push({
        severity: "error",
        code: "PARENT_CYCLE",
        pageId: frame.nodeId,
        pageName: pageName(frame.nodeId),
        message: `页面「${pageName(frame.nodeId) ?? frame.nodeId}」的父级形成了循环引用`,
      });
    }
  }

  const parentedPageIds = new Set(
    document.pages
      .filter((page) => page.parentId)
      .map((page) => page.id),
  );

  for (const link of document.links) {
    const fromMissing = !pagesById.has(link.fromId);
    const toMissing = !pagesById.has(link.toId);
    if (fromMissing || toMissing) {
      const missingId = fromMissing ? link.fromId : link.toId;
      const existingId = fromMissing ? link.toId : link.fromId;
      push({
        severity: "error",
        code: "LINK_ENDPOINT_MISSING",
        pageId: pagesById.has(existingId) ? existingId : null,
        pageName: pageName(
          pagesById.has(existingId) ? existingId : null,
        ),
        message: `关联线 ${link.id} 的端点 ${missingId} 不存在`,
        linkId: link.id,
      });
    }

    if (
      parentedPageIds.has(link.fromId) ||
      parentedPageIds.has(link.toId)
    ) {
      const childId = parentedPageIds.has(link.fromId)
        ? link.fromId
        : link.toId;
      push({
        severity: "error",
        code: "LINK_ON_CHILD_PAGE",
        pageId: childId,
        pageName: pageName(childId),
        message: `关联线 ${link.id} 连接了子页面「${
          pageName(childId) ?? childId
        }」，子页面不能建立关联线`,
        linkId: link.id,
      });
    }
  }

  // 3. Behavior graph validation. The shared project graph is checked
  // with the page graphs; it does not belong to one layer.
  const behaviorHosts: CanvasPageDto[] = [
    ...document.pages,
    ...(document.behavior
      ? [
          {
            id: "__project__",
            name: "项目",
            x: 0,
            y: 0,
            styles: {},
            behavior: document.behavior,
          },
        ]
      : []),
  ];
  for (const page of behaviorHosts) {
    const behavior = page.behavior;
    if (!behavior) continue;

    const states = new Set(behavior.states.map((state) => state.id));
    const initialStates = behavior.states.filter(
      (state) => state.initial,
    );

    if (initialStates.length > 1) {
      push({
        severity: "error",
        code: "BEHAVIOR_INITIAL_STATE_DUPLICATE",
        pageId: page.id,
        pageName: page.name,
        message: `页面「${page.name}」存在 ${initialStates.length} 个初始状态`,
      });
    }

    for (const trigger of behavior.triggers) {
      if (trigger.stateId && !states.has(trigger.stateId)) {
        push({
          severity: "error",
          code: "BEHAVIOR_STATE_MISSING",
          pageId: page.id,
          pageName: page.name,
          message: `页面「${page.name}」的触发器 ${trigger.id} 引用了不存在的状态 ${trigger.stateId}`,
          triggerId: trigger.id,
        });
      }

      if (trigger.actions.length === 0) {
        push({
          severity: "warning",
          code: "BEHAVIOR_TRIGGER_EMPTY",
          pageId: page.id,
          pageName: page.name,
          message: `页面「${page.name}」的触发器 ${trigger.id} 没有动作`,
          triggerId: trigger.id,
        });
      }

      for (const action of trigger.actions) {
        validateAction({
          action,
          page,
          pagesById,
          states,
          push,
        });
      }
    }

    const blocks = behavior.blocks ?? [];
    const edges = behavior.edges ?? [];
    if (blocks.length > 0 || edges.length > 0) {
      const graphIds = new Set(states);
      const blockIds = new Set<string>();
      for (const block of blocks) {
        if (!block || typeof block.id !== "string") {
          push({
            severity: "error",
            code: "BEHAVIOR_BLOCK_INVALID",
            pageId: page.id,
            pageName: page.name,
            message: `页面「${page.name}」存在缺少 id 的行为块`,
          });
          continue;
        }
        if (graphIds.has(block.id) || blockIds.has(block.id)) {
          push({
            severity: "error",
            code: "BEHAVIOR_BLOCK_DUPLICATE",
            pageId: page.id,
            pageName: page.name,
            message: `行为块 ${block.id} 与状态或其他块重复`,
          });
        }
        blockIds.add(block.id);
        graphIds.add(block.id);
        if (block.type === "event") {
          const bound = block.nodeId
            ? pagesById.get(block.nodeId)
            : undefined;
          if (!block.nodeId || !bound) {
            push({
              severity: "error",
              code: "BEHAVIOR_TARGET_MISSING",
              pageId: page.id,
              pageName: page.name,
              message: `行为图「${page.name}」的事件块 ${block.id} 没有有效节点`,
            });
          } else if (
            !block.event ||
            !getSupportedCanvasEvents(bound.widget?.kind).includes(
              block.event,
            )
          ) {
            push({
              severity: "error",
              code: "BEHAVIOR_EVENT_UNSUPPORTED",
              pageId: page.id,
              pageName: page.name,
              message: `${bound.name} 不支持事件 ${block.event ?? ""}`,
            });
          }
        }
        if (block.stateId && !states.has(block.stateId)) {
          push({
            severity: "error",
            code: "BEHAVIOR_STATE_MISSING",
            pageId: page.id,
            pageName: page.name,
            message: `事件块 ${block.id} 引用了不存在的状态 ${block.stateId}`,
          });
        }
        if (block.type === "switch") {
          if (!block.nodeId || !pagesById.has(block.nodeId)) {
            push({
              severity: "error",
              code: "BEHAVIOR_TARGET_MISSING",
              pageId: page.id,
              pageName: page.name,
              message: `页面「${page.name}」的分支块 ${block.id} 没有有效节点`,
            });
          }
          if (!block.key?.trim()) {
            push({
              severity: "error",
              code: "BEHAVIOR_STYLE_KEY_MISSING",
              pageId: page.id,
              pageName: page.name,
              message: `分支块 ${block.id} 没有属性 ID`,
            });
          }
        }
        if (block.type === "reference") {
          if (!block.nodeId || !pagesById.has(block.nodeId)) {
            push({
              severity: "error",
              code: "BEHAVIOR_REFERENCE_MISSING",
              pageId: page.id,
              pageName: page.name,
              message: `页面「${page.name}」的节点块 ${block.id} 引用了不存在的图层`,
            });
          }
        }
        if (block.type === "action" && block.action) {
          validateAction({
            action: block.action,
            page,
            pagesById,
            states,
            push,
          });
        }
        if (block.type === "condition") {
          const conditions =
            block.conditions && block.conditions.length > 0
              ? block.conditions
              : block.condition
                ? [block.condition]
                : [];
          for (const condition of conditions) {
            if (
              condition.source !== "state" &&
              condition.source !== "variable" &&
              !condition.targetId
            ) {
              push({
                severity: "error",
                code: "BEHAVIOR_TARGET_MISSING",
                pageId: page.id,
                pageName: page.name,
                message: `行为图「${page.name}」的条件 ${condition.id} 没有目标节点`,
              });
            }
            if (condition.source !== "nodeData" || !condition.targetId) {
              continue;
            }
            const target = pagesById.get(condition.targetId);
            if (
              !target ||
              !condition.key ||
              !target.data?.some(
                (entry) => entry.key === condition.key,
              )
            ) {
              push({
                severity: "error",
                code: "BEHAVIOR_DATA_KEY_MISSING",
                pageId: page.id,
                pageName: page.name,
                message: `节点数据 ${condition.key ?? ""} 未声明`,
              });
            }
          }
        }
      }
      const edgeIds = new Set<string>();
      for (const edge of edges) {
        if (!edge || typeof edge.id !== "string") {
          push({
            severity: "error",
            code: "BEHAVIOR_EDGE_INVALID",
            pageId: page.id,
            pageName: page.name,
            message: `页面「${page.name}」存在缺少 id 的行为连线`,
          });
          continue;
        }
        if (edgeIds.has(edge.id)) {
          push({
            severity: "error",
            code: "BEHAVIOR_EDGE_DUPLICATE",
            pageId: page.id,
            pageName: page.name,
            message: `行为连线 ${edge.id} 重复`,
          });
        }
        edgeIds.add(edge.id);
        if (!graphIds.has(edge.from) || !graphIds.has(edge.to)) {
          push({
            severity: "error",
            code: "BEHAVIOR_EDGE_DANGLING",
            pageId: page.id,
            pageName: page.name,
            message: `行为连线 ${edge.id} 连接了不存在的块`,
          });
        }
      }
    }
  }

  const scoped = options.pageIds
    ? items.filter((item) => {
        if (item.pageIds?.length) {
          return item.pageIds.some((id) => options.pageIds?.has(id));
        }
        if (!item.pageId) return true;
        return options.pageIds?.has(item.pageId) ?? false;
      })
    : items;

  const errors = scoped.filter((item) => item.severity === "error");
  const warnings = scoped.filter((item) => item.severity === "warning");

  return {
    items: scoped,
    errors,
    warnings,
    summary: summarizeLintItems(scoped),
  };
}

function validateAction(input: {
  action: CanvasBehaviorActionDto;
  page: CanvasPageDto;
  pagesById: Map<string, CanvasPageDto>;
  states: Set<string>;
  push: (item: CanvasLintItem) => void;
}) {
  const { action, page, pagesById, states, push } = input;
  const actionType = (action as { type: string }).type;

  if (!BEHAVIOR_ACTION_TYPES.has(actionType as CanvasBehaviorActionType)) {
    push({
      severity: "error",
      code: "BEHAVIOR_ACTION_UNKNOWN",
      pageId: page.id,
      pageName: page.name,
      message: `页面「${page.name}」的动作 ${action.id} 使用了未知类型 ${actionType || "(空)"}`,
      actionId: action.id,
    });
    return;
  }

  if (actionType === "apply") {
    let entries: unknown = [];
    try {
      entries = JSON.parse(action.value || "[]");
    } catch {
      push({
        severity: "error",
        code: "BEHAVIOR_APPLY_INVALID",
        pageId: page.id,
        pageName: page.name,
        message: `页面「${page.name}」的动作 ${action.id} 不是合法的多项修改`,
        actionId: action.id,
      });
      return;
    }
    if (!Array.isArray(entries)) {
      push({
        severity: "error",
        code: "BEHAVIOR_APPLY_INVALID",
        pageId: page.id,
        pageName: page.name,
        message: `页面「${page.name}」的动作 ${action.id} 不是合法的多项修改`,
        actionId: action.id,
      });
      return;
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const targetId =
        typeof (entry as { targetId?: unknown }).targetId === "string"
          ? (entry as { targetId: string }).targetId
          : "";
      if (targetId && !pagesById.has(targetId)) {
        push({
          severity: "error",
          code: "BEHAVIOR_TARGET_MISSING",
          pageId: page.id,
          pageName: page.name,
          message: `页面「${page.name}」的动作 ${action.id} 指向了不存在的节点 ${targetId}`,
          actionId: action.id,
        });
      }
    }
    return;
  }

  if (actionType === "navigate") {
    if (!action.pageId || !pagesById.has(action.pageId)) {
      push({
        severity: "error",
        code: "BEHAVIOR_PAGE_MISSING",
        pageId: page.id,
        pageName: page.name,
        message: `页面「${page.name}」的动作 ${action.id} 跳转的目标页面 ${
          action.pageId || "(空)"
        } 不存在`,
        actionId: action.id,
      });
    }
    return;
  }

  if (actionType === "setState") {
    if (!action.value || !states.has(action.value)) {
      push({
        severity: "error",
        code: "BEHAVIOR_STATE_MISSING",
        pageId: page.id,
        pageName: page.name,
        message: `页面「${page.name}」的动作 ${action.id} 设置了不存在的状态 ${
          action.value || "(空)"
        }`,
        actionId: action.id,
      });
    }
    return;
  }

  if (DATA_ACTION_TYPES.has(actionType)) {
    if (!action.targetId) {
      push({
        severity: "error",
        code: "BEHAVIOR_TARGET_MISSING",
        pageId: page.id,
        pageName: page.name,
        message: `页面「${page.name}」的动作 ${action.id} 没有目标节点`,
        actionId: action.id,
      });
      return;
    }
    const target = pagesById.get(action.targetId);
    const entry = target?.data?.find(
      (item) => item.key === action.key,
    );
    if (!target || !action.key || !entry) {
      push({
        severity: "error",
        code: "BEHAVIOR_DATA_KEY_MISSING",
        pageId: page.id,
        pageName: page.name,
        message: `页面「${page.name}」的动作 ${action.id} 引用了不存在的节点数据 ${
          action.key || "(空)"
        }`,
        actionId: action.id,
      });
    } else if (
      actionType === "incrementData" &&
      entry.type !== "number"
    ) {
      push({
        severity: "error",
        code: "BEHAVIOR_DATA_TYPE_MISMATCH",
        pageId: page.id,
        pageName: page.name,
        message: `节点数据 ${action.key} 不是 number 类型`,
        actionId: action.id,
      });
    } else if (
      actionType === "toggleData" &&
      entry.type !== "boolean"
    ) {
      push({
        severity: "error",
        code: "BEHAVIOR_DATA_TYPE_MISMATCH",
        pageId: page.id,
        pageName: page.name,
        message: `节点数据 ${action.key} 不是 boolean 类型`,
        actionId: action.id,
      });
    }
    return;
  }

  if (TARGET_ACTION_TYPES.has(actionType)) {
    if (!action.targetId || !pagesById.has(action.targetId)) {
      push({
        severity: "error",
        code: "BEHAVIOR_TARGET_MISSING",
        pageId: page.id,
        pageName: page.name,
        message: `页面「${page.name}」的动作 ${action.id} 引用了不存在的目标节点 ${
          action.targetId || "(空)"
        }`,
        actionId: action.id,
      });
    }
  }
}
