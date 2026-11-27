/**
 * Shared canvas layout resolver.
 *
 * The design document stores every page/node in world coordinates plus its
 * style map. This resolver is the single source of truth for turning those
 * inputs into concrete frames. It intentionally supports only a small,
 * deterministic subset of CSS lengths: px, %, calc(), min(), max(), clamp(),
 * and auto. No JavaScript or arbitrary expressions are evaluated.
 */

export interface CanvasLayoutNode {
  id: string;
  x: number;
  y: number;
  parentId?: string;
  styles: Record<string, string>;
}

export type CanvasLayoutIssueCode =
  | "invalid-length"
  | "invalid-aspect-ratio"
  | "percent-without-reference"
  | "parent-missing"
  | "parent-cycle"
  | "negative-size";

export interface CanvasLayoutIssue {
  code: CanvasLayoutIssueCode;
  severity: "error" | "warning";
  nodeId: string;
  styleKey: string;
  value: string;
  message: string;
}

export interface CanvasResolvedFrame {
  nodeId: string;
  parentId: string | null;
  localX: number;
  localY: number;
  width: number;
  height: number;
  worldX: number;
  worldY: number;
  valid: boolean;
  issues: CanvasLayoutIssue[];
}

export interface CanvasLengthResolution {
  value: number | null;
  auto: boolean;
  kind: "empty" | "auto" | "px" | "percent" | "calc" | "invalid";
}

const DEFAULT_SIZE = 800;
const LENGTH_PATTERN = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(%|px)?$/i;

/**
 * Parse a CSS aspect-ratio value. Supported forms are `16 / 9`, `16/9`,
 * and a single positive number such as `1.5`. `auto`, empty, or invalid
 * values return `null`.
 */
const ASPECT_RATIO_PART = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

export function resolveCanvasAspectRatio(
  value: string | undefined,
): number | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  if (!text || text === "auto") return null;
  const parts = text.split("/").map((part) => part.trim());
  if (parts.length === 1) {
    if (!ASPECT_RATIO_PART.test(parts[0])) return null;
    const ratio = Number.parseFloat(parts[0]);
    return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
  }
  if (parts.length !== 2) return null;
  if (
    !ASPECT_RATIO_PART.test(parts[0]) ||
    !ASPECT_RATIO_PART.test(parts[1])
  ) {
    return null;
  }
  const numerator = Number.parseFloat(parts[0]);
  const denominator = Number.parseFloat(parts[1]);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return null;
  }
  return numerator / denominator;
}

function blankResolution(kind: CanvasLengthResolution["kind"]): CanvasLengthResolution {
  return { value: null, auto: kind === "empty" || kind === "auto", kind };
}

function invalidResolution(): CanvasLengthResolution {
  return { value: null, auto: false, kind: "invalid" };
}

function shouldIgnore(value: string) {
  const text = value.trim();
  return (
    !text ||
    text === "auto" ||
    text.includes("${") ||
    text.includes("var(")
  );
}

/**
 * Resolve one CSS length to a number in px.
 *
 * `reference` is the containing content-box size used by percentages. When it
 * is missing, a percentage cannot be resolved and the result is invalid; the
 * caller decides whether to fall back.
 */
export function resolveCanvasLength(
  value: string | undefined,
  reference?: number,
): CanvasLengthResolution {
  if (value === undefined) return blankResolution("empty");
  const text = value.trim();
  if (!text) return blankResolution("empty");
  if (text.toLowerCase() === "auto") return blankResolution("auto");
  if (shouldIgnore(text)) return invalidResolution();

  const direct = LENGTH_PATTERN.exec(text);
  if (direct) {
    const amount = Number.parseFloat(direct[1]);
    if (!Number.isFinite(amount)) return invalidResolution();
    const unit = (direct[2] ?? "px").toLowerCase();
    if (unit === "%") {
      if (reference === undefined || !Number.isFinite(reference)) {
        return invalidResolution();
      }
      return {
        value: (reference * amount) / 100,
        auto: false,
        kind: "percent",
      };
    }
    return { value: amount, auto: false, kind: "px" };
  }

  const result = evaluateLengthFunction(text, reference);
  if (result === null) return invalidResolution();
  return { value: result, auto: false, kind: "calc" };
}

function evaluateLengthFunction(
  text: string,
  reference: number | undefined,
): number | null {
  const match = /^([a-z-]+)\(([\s\S]*)\)$/i.exec(text);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const body = match[2];

  if (name === "calc") {
    return evaluateExpression(body, reference);
  }

  if (name === "min" || name === "max") {
    const args = splitTopLevel(body, ",");
    if (args.length === 0) return null;
    const values: number[] = [];
    for (const arg of args) {
      const value = evaluateExpression(arg, reference);
      if (value === null) return null;
      values.push(value);
    }
    return name === "min" ? Math.min(...values) : Math.max(...values);
  }

  if (name === "clamp") {
    const args = splitTopLevel(body, ",");
    if (args.length !== 3) return null;
    const values: number[] = [];
    for (const arg of args) {
      const value = evaluateExpression(arg, reference);
      if (value === null) return null;
      values.push(value);
    }
    const [min, preferred, max] = values;
    return Math.min(Math.max(preferred, min), max);
  }

  return null;
}

function splitTopLevel(text: string, separator: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

interface ExpressionCursor {
  text: string;
  index: number;
  reference: number | undefined;
  failed: boolean;
}

function evaluateExpression(
  text: string,
  reference: number | undefined,
): number | null {
  const cursor: ExpressionCursor = {
    text,
    index: 0,
    reference,
    failed: false,
  };
  const value = parseSum(cursor);
  skipSpaces(cursor);
  if (cursor.failed || cursor.index < cursor.text.length) return null;
  return value;
}

function skipSpaces(cursor: ExpressionCursor) {
  while (cursor.index < cursor.text.length && /\s/.test(cursor.text[cursor.index])) {
    cursor.index += 1;
  }
}

function peek(cursor: ExpressionCursor) {
  skipSpaces(cursor);
  return cursor.text[cursor.index];
}

function parseSum(cursor: ExpressionCursor): number {
  let value = parseProduct(cursor);
  while (!cursor.failed) {
    const char = peek(cursor);
    if (char !== "+" && char !== "-") break;
    cursor.index += 1;
    const right = parseProduct(cursor);
    value = char === "+" ? value + right : value - right;
  }
  return value;
}

function parseProduct(cursor: ExpressionCursor): number {
  let value = parseUnary(cursor);
  while (!cursor.failed) {
    const char = peek(cursor);
    if (char !== "*" && char !== "/") break;
    cursor.index += 1;
    const right = parseUnary(cursor);
    if (char === "/") {
      if (right === 0) {
        cursor.failed = true;
        return 0;
      }
      value /= right;
    } else {
      value *= right;
    }
  }
  return value;
}

function parseUnary(cursor: ExpressionCursor): number {
  const char = peek(cursor);
  if (char === "+" || char === "-") {
    cursor.index += 1;
    const value = parseUnary(cursor);
    return char === "-" ? -value : value;
  }
  return parsePrimary(cursor);
}

function parsePrimary(cursor: ExpressionCursor): number {
  const char = peek(cursor);
  if (char === undefined) {
    cursor.failed = true;
    return 0;
  }
  if (char === "(") {
    cursor.index += 1;
    const value = parseSum(cursor);
    if (peek(cursor) !== ")") {
      cursor.failed = true;
      return 0;
    }
    cursor.index += 1;
    return value;
  }

  const rest = cursor.text.slice(cursor.index);
  const numberMatch = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(%|px)?/i.exec(rest);
  if (numberMatch) {
    const isIdentifierStart =
      cursor.index > 0 && /[a-z0-9_-]/i.test(cursor.text[cursor.index - 1]);
    if (!isIdentifierStart) {
      cursor.index += numberMatch[0].length;
      const amount = Number.parseFloat(numberMatch[1]);
      const unit = (numberMatch[2] ?? "px").toLowerCase();
      if (unit === "%") {
        if (
          cursor.reference === undefined ||
          !Number.isFinite(cursor.reference)
        ) {
          cursor.failed = true;
          return 0;
        }
        return (cursor.reference * amount) / 100;
      }
      return amount;
    }
  }

  const functionMatch = /^([a-z-]+)\(/i.exec(rest);
  if (functionMatch) {
    const name = functionMatch[1].toLowerCase();
    const start = cursor.index + functionMatch[0].length;
    let depth = 1;
    let end = start;
    while (end < cursor.text.length && depth > 0) {
      if (cursor.text[end] === "(") depth += 1;
      if (cursor.text[end] === ")") depth -= 1;
      end += 1;
    }
    if (depth !== 0) {
      cursor.failed = true;
      return 0;
    }
    const body = cursor.text.slice(start, end - 1);
    cursor.index = end;
    const result = evaluateLengthFunction(`${name}(${body})`, cursor.reference);
    if (result === null) {
      cursor.failed = true;
      return 0;
    }
    return result;
  }

  cursor.failed = true;
  return 0;
}

function resolveValueOrFallback(
  styles: Record<string, string>,
  key: string,
  reference: number | undefined,
  fallback: number,
  issues: CanvasLayoutIssue[],
  nodeId: string,
  options: { allowNegative?: boolean; size?: boolean } = {},
) {
  const raw = styles[key];
  const result = resolveCanvasLength(raw, reference);
  if (result.kind === "invalid") {
    issues.push({
      code:
        raw !== undefined && raw.includes("%")
          ? "percent-without-reference"
          : "invalid-length",
      severity: "error",
      nodeId,
      styleKey: key,
      value: raw ?? "",
      message: `无法解析 ${key}: ${raw ?? ""}`,
    });
    return fallback;
  }
  if (result.value === null) return fallback;
  let value = result.value;
  if (!options.allowNegative) value = Math.max(0, value);
  return value;
}

function resolveOptional(
  styles: Record<string, string>,
  key: string,
  reference: number | undefined,
  issues: CanvasLayoutIssue[],
  nodeId: string,
) {
  const raw = styles[key];
  if (raw === undefined) return null;
  const result = resolveCanvasLength(raw, reference);
  if (result.kind === "invalid" || result.value === null) {
    if (!shouldIgnore(raw)) {
      issues.push({
        code: raw.includes("%")
          ? "percent-without-reference"
          : "invalid-length",
        severity: "error",
        nodeId,
        styleKey: key,
        value: raw,
        message: `无法解析 ${key}: ${raw}`,
      });
    }
    return null;
  }
  return result.value;
}

/**
 * Resolve every node into a frame. Handles nesting, percentages, calc(),
 * aspect-ratio, min/max constraints, left/right/top/bottom anchoring, and
 * cycle detection.
 */
export function resolveCanvasLayout(
  nodes: CanvasLayoutNode[],
): Map<string, CanvasResolvedFrame> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const frames = new Map<string, CanvasResolvedFrame>();
  const resolving = new Set<string>();

  const resolveNode = (
    node: CanvasLayoutNode,
    depth: number,
  ): CanvasResolvedFrame => {
    const cached = frames.get(node.id);
    if (cached) return cached;

    if (depth > 64 || resolving.has(node.id)) {
      const fallback: CanvasResolvedFrame = {
        nodeId: node.id,
        parentId: node.parentId ?? null,
        localX: node.x,
        localY: node.y,
        width: DEFAULT_SIZE,
        height: DEFAULT_SIZE,
        worldX: node.x,
        worldY: node.y,
        valid: false,
        issues: [
          {
            code: "parent-cycle",
            severity: "error",
            nodeId: node.id,
            styleKey: "parentId",
            value: node.parentId ?? "",
            message: "页面父级形成了循环引用",
          },
        ],
      };
      frames.set(node.id, fallback);
      return fallback;
    }

    const issues: CanvasLayoutIssue[] = [];
    const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
    if (node.parentId && !parent) {
      issues.push({
        code: "parent-missing",
        severity: "error",
        nodeId: node.id,
        styleKey: "parentId",
        value: node.parentId,
        message: `父节点 ${node.parentId} 不存在`,
      });
    }

    let parentFrame: CanvasResolvedFrame | null = null;
    if (parent) {
      resolving.add(node.id);
      parentFrame = resolveNode(parent, depth + 1);
      resolving.delete(node.id);
    }

    const referenceWidth = parentFrame?.width;
    const referenceHeight = parentFrame?.height;
    const styles = node.styles ?? {};

    let widthAuto =
      !styles.width || styles.width.trim().toLowerCase() === "auto";
    let heightAuto =
      !styles.height || styles.height.trim().toLowerCase() === "auto";
    let widthResolved = !widthAuto;
    let heightResolved = !heightAuto;

    let width = resolveValueOrFallback(
      styles,
      "width",
      referenceWidth,
      parentFrame?.width ?? DEFAULT_SIZE,
      issues,
      node.id,
      { size: true },
    );
    let height = resolveValueOrFallback(
      styles,
      "height",
      referenceHeight,
      parentFrame?.height ?? DEFAULT_SIZE,
      issues,
      node.id,
      { size: true },
    );

    const left = resolveOptional(styles, "left", referenceWidth, issues, node.id);
    const right = resolveOptional(
      styles,
      "right",
      referenceWidth,
      issues,
      node.id,
    );
    const top = resolveOptional(styles, "top", referenceHeight, issues, node.id);
    const bottom = resolveOptional(
      styles,
      "bottom",
      referenceHeight,
      issues,
      node.id,
    );

    if (parentFrame && left !== null && right !== null && widthAuto) {
      width = Math.max(0, parentFrame.width - left - right);
      widthResolved = true;
      widthAuto = false;
    }
    if (parentFrame && top !== null && bottom !== null && heightAuto) {
      height = Math.max(0, parentFrame.height - top - bottom);
      heightResolved = true;
      heightAuto = false;
    }

    const aspectRaw = styles["aspect-ratio"]?.trim();
    const aspectRatio = resolveCanvasAspectRatio(aspectRaw);
    if (
      aspectRaw &&
      aspectRaw.toLowerCase() !== "auto" &&
      aspectRatio === null
    ) {
      issues.push({
        code: "invalid-aspect-ratio",
        severity: "error",
        nodeId: node.id,
        styleKey: "aspect-ratio",
        value: aspectRaw,
        message: `无法解析 aspect-ratio: ${aspectRaw}`,
      });
    } else if (aspectRatio !== null) {
      if (widthResolved && !heightResolved) {
        height = width / aspectRatio;
        heightResolved = true;
      } else if (!widthResolved && heightResolved) {
        width = height * aspectRatio;
        widthResolved = true;
      }
    }

    const minWidth = resolveOptional(
      styles,
      "min-width",
      referenceWidth,
      issues,
      node.id,
    );
    const maxWidth = resolveOptional(
      styles,
      "max-width",
      referenceWidth,
      issues,
      node.id,
    );
    const minHeight = resolveOptional(
      styles,
      "min-height",
      referenceHeight,
      issues,
      node.id,
    );
    const maxHeight = resolveOptional(
      styles,
      "max-height",
      referenceHeight,
      issues,
      node.id,
    );
    if (minWidth !== null) width = Math.max(width, Math.max(0, minWidth));
    if (maxWidth !== null) width = Math.min(width, Math.max(0, maxWidth));
    if (minHeight !== null) height = Math.max(height, Math.max(0, minHeight));
    if (maxHeight !== null) height = Math.min(height, Math.max(0, maxHeight));

    let worldX: number;
    let worldY: number;
    if (parentFrame) {
      // 没有 left/right、top/bottom 时，x/y 是相对父节点的偏移。
      // 世界坐标由父节点推出来，拖动父节点时子节点跟着走。
      if (left !== null) {
        worldX = parentFrame.worldX + left;
      } else if (right !== null) {
        worldX = parentFrame.worldX + parentFrame.width - right - width;
      } else {
        worldX = parentFrame.worldX + node.x;
      }
      if (top !== null) {
        worldY = parentFrame.worldY + top;
      } else if (bottom !== null) {
        worldY = parentFrame.worldY + parentFrame.height - bottom - height;
      } else {
        worldY = parentFrame.worldY + node.y;
      }
    } else {
      worldX = left ?? node.x;
      worldY = top ?? node.y;
    }

    const frame: CanvasResolvedFrame = {
      nodeId: node.id,
      parentId: node.parentId ?? null,
      localX: parentFrame ? worldX - parentFrame.worldX : worldX,
      localY: parentFrame ? worldY - parentFrame.worldY : worldY,
      width,
      height,
      worldX,
      worldY,
      valid: !issues.some((issue) => issue.severity === "error"),
      issues,
    };
    frames.set(node.id, frame);
    return frame;
  };

  for (const node of nodes) resolveNode(node, 0);
  return frames;
}

/**
 * 把旧文档里“子节点 x/y 就是世界坐标”换成相对父节点的偏移。
 * 根节点不变。转换后世界位置保持原样。
 */
export function convertStoredWorldPositions<
  T extends { id: string; parentId?: string; x: number; y: number },
>(nodes: T[]): T[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const world = new Map<string, { x: number; y: number }>();
  const visiting = new Set<string>();

  const place = (node: T): { x: number; y: number } => {
    const cached = world.get(node.id);
    if (cached) return cached;
    if (visiting.has(node.id)) return { x: node.x, y: node.y };
    visiting.add(node.id);

    const storedX = node.x;
    const storedY = node.y;
    const parent = node.parentId
      ? nodesById.get(node.parentId)
      : undefined;
    if (parent) {
      const parentWorld = place(parent);
      node.x = storedX - parentWorld.x;
      node.y = storedY - parentWorld.y;
    }
    const result = { x: storedX, y: storedY };
    world.set(node.id, result);
    return result;
  };

  for (const node of nodes) place(node);
  return nodes;
}

/**
 * Convenience helper for code paths that only need a number. Returns the
 * fallback when the value is empty, auto, or invalid.
 */
export function resolveCanvasLengthValue(
  value: string | undefined,
  reference: number | undefined,
  fallback: number,
) {
  const result = resolveCanvasLength(value, reference);
  return result.value === null ? fallback : result.value;
}
