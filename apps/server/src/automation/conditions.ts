import { ApiError } from "../lib/errors.js";

export type ConditionOperator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "exists"
  | "not_exists"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export interface AutomationCondition {
  all?: AutomationCondition[];
  any?: AutomationCondition[];
  not?: AutomationCondition;
  path?: string;
  op?: ConditionOperator;
  value?: unknown;
}

export interface AutomationEventContext {
  signal: string;
  source: string;
  depth: number;
  payload: Record<string, unknown>;
}

const OPERATORS = new Set<ConditionOperator>([
  "eq",
  "neq",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
  "gt",
  "gte",
  "lt",
  "lte",
]);

const BLOCKED_PATH_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const MAX_CONDITION_NODES = 30;
const MAX_CONDITION_DEPTH = 6;
const MAX_PATH_LENGTH = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function countNodes(
  condition: AutomationCondition,
  depth: number,
): number {
  if (depth > MAX_CONDITION_DEPTH) {
    throw new ApiError(
      400,
      "AUTOMATION_CONDITION_INVALID",
      "触发条件嵌套层级过深",
    );
  }

  let count = 1;
  for (const child of condition.all ?? []) {
    count += countNodes(child, depth + 1);
  }
  for (const child of condition.any ?? []) {
    count += countNodes(child, depth + 1);
  }
  if (condition.not) count += countNodes(condition.not, depth + 1);

  if (count > MAX_CONDITION_NODES) {
    throw new ApiError(
      400,
      "AUTOMATION_CONDITION_INVALID",
      "触发条件过于复杂",
    );
  }
  return count;
}

export function validateCondition(condition: unknown): AutomationCondition {
  if (condition === undefined || condition === null) {
    return { all: [] };
  }

  if (!isRecord(condition)) {
    throw new ApiError(
      400,
      "AUTOMATION_CONDITION_INVALID",
      "触发条件格式不正确",
    );
  }

  const tree = condition as AutomationCondition;
  countNodes(tree, 0);

  const groups = [tree.all, tree.any].filter(Boolean) as AutomationCondition[][];
  for (const group of groups) {
    if (!Array.isArray(group)) {
      throw new ApiError(
        400,
        "AUTOMATION_CONDITION_INVALID",
        "触发条件格式不正确",
      );
    }
  }

  const leaves: AutomationCondition[] = [];
  const collectLeaves = (node: AutomationCondition) => {
    for (const child of node.all ?? []) collectLeaves(child);
    for (const child of node.any ?? []) collectLeaves(child);
    if (node.not) collectLeaves(node.not);
    if (
      node.path !== undefined ||
      node.op !== undefined ||
      node.value !== undefined
    ) {
      leaves.push(node);
    }
  };
  collectLeaves(tree);

  for (const leaf of leaves) {
    if (
      typeof leaf.path !== "string" ||
      !leaf.path ||
      leaf.path.length > MAX_PATH_LENGTH
    ) {
      throw new ApiError(
        400,
        "AUTOMATION_CONDITION_INVALID",
        "条件字段路径不正确",
      );
    }

    for (const segment of leaf.path.split(".")) {
      if (BLOCKED_PATH_SEGMENTS.has(segment)) {
        throw new ApiError(
          400,
          "AUTOMATION_CONDITION_INVALID",
          "条件字段路径不正确",
        );
      }
    }

    if (!leaf.op || !OPERATORS.has(leaf.op)) {
      throw new ApiError(
        400,
        "AUTOMATION_CONDITION_INVALID",
        "条件操作符不正确",
      );
    }
  }

  return tree;
}

function resolvePath(
  context: AutomationEventContext,
  path: string,
): unknown {
  const segments = path.split(".").filter(Boolean);
  let value: unknown = context;

  for (const segment of segments) {
    if (!isRecord(value)) return undefined;
    value = value[segment];
  }

  return value;
}

function comparableEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    (typeof left === "object" && left !== null) ||
    (typeof right === "object" && right !== null)
  ) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  return false;
}

function compareNumbers(
  left: unknown,
  right: unknown,
): number | null {
  const leftNumber =
    typeof left === "number" ? left : Number(left);
  const rightNumber =
    typeof right === "number" ? right : Number(right);

  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return null;
  }
  return leftNumber - rightNumber;
}

export function evaluateCondition(
  condition: AutomationCondition,
  context: AutomationEventContext,
): boolean {
  if (condition.all && condition.all.length > 0) {
    return condition.all.every((child) =>
      evaluateCondition(child, context),
    );
  }

  if (condition.any && condition.any.length > 0) {
    return condition.any.some((child) =>
      evaluateCondition(child, context),
    );
  }

  if (condition.not) {
    return !evaluateCondition(condition.not, context);
  }

  if (!condition.path || !condition.op) return true;

  const actual = resolvePath(context, condition.path);
  const expected = condition.value;

  switch (condition.op) {
    case "eq":
      return comparableEqual(actual, expected);
    case "neq":
      return !comparableEqual(actual, expected);
    case "exists":
      return actual !== undefined && actual !== null;
    case "not_exists":
      return actual === undefined || actual === null;
    case "contains":
      if (typeof actual === "string") {
        return actual.includes(String(expected ?? ""));
      }
      if (Array.isArray(actual)) {
        return actual.some((item) => comparableEqual(item, expected));
      }
      return false;
    case "not_contains":
      if (typeof actual === "string") {
        return !actual.includes(String(expected ?? ""));
      }
      if (Array.isArray(actual)) {
        return !actual.some((item) => comparableEqual(item, expected));
      }
      return true;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const difference = compareNumbers(actual, expected);
      if (difference === null) return false;
      if (condition.op === "gt") return difference > 0;
      if (condition.op === "gte") return difference >= 0;
      if (condition.op === "lt") return difference < 0;
      return difference <= 0;
    }
    default:
      return false;
  }
}

export function conditionSummary(condition: AutomationCondition): string {
  const leaves: AutomationCondition[] = [];
  const collect = (node: AutomationCondition, joiner: "all" | "any") => {
    for (const child of node.all ?? []) collect(child, "all");
    for (const child of node.any ?? []) collect(child, "any");
    if (node.not) collect(node.not, "any");
    if (node.path && node.op) {
      leaves.push(node);
    }
  };
  collect(condition, "all");
  if (leaves.length === 0) return "always";
  return leaves
    .slice(0, 3)
    .map((leaf) => `${leaf.path} ${leaf.op}`)
    .join(condition.any && !condition.all ? " OR " : " AND ");
}
