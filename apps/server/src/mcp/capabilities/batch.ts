import { ApiError } from "../../lib/errors.js";
import type { McpController } from "../controller.js";
import {
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
  type McpCapability,
} from "../types.js";

const MAX_BATCH_OPERATIONS = 200;
const MAX_BATCH_ARGUMENT_LENGTH = 2_000_000;

/**
 * Only canvas/layout/behavior write capabilities are allowed. Screenshots,
 * project deletion, account changes, and batch_apply itself are excluded so a
 * batch cannot escape the project it was scoped to or recurse.
 */
const BATCH_WRITE_TOOLS = new Set([
  "create_page",
  "update_page",
  "delete_page",
  "duplicate_page",
  "update_page_styles",
  "update_page_widget",
  "update_page_data",
  "create_link",
  "update_link",
  "delete_link",
  "move_page",
  "resize_page",
  "set_page_parent",
  "reorder_layers",
  "set_layout",
  "batch_update_layout",
  "update_behavior",
  "update_runtime_variables",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidBatch(message: string): never {
  throw new ApiError(400, "MCP_BATCH_INVALID", message);
}

interface BatchOperation {
  tool: string;
  arguments: Record<string, unknown>;
}

function parseOperations(value: unknown): BatchOperation[] {
  if (typeof value !== "string") {
    invalidBatch("operations 必须是 JSON 字符串");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    invalidBatch("operations 必须是合法的 JSON");
  }
  if (!Array.isArray(parsed)) {
    invalidBatch("operations 必须是 JSON 数组");
  }
  if (parsed.length === 0) {
    invalidBatch("operations 至少需要一项");
  }
  if (parsed.length > MAX_BATCH_OPERATIONS) {
    invalidBatch(`operations 不能超过 ${MAX_BATCH_OPERATIONS} 项`);
  }

  return parsed.map((raw, index) => {
    if (!isRecord(raw)) {
      invalidBatch(`operations[${index}] 必须是对象`);
    }
    const tool = typeof raw.tool === "string" ? raw.tool.trim() : "";
    if (!BATCH_WRITE_TOOLS.has(tool)) {
      invalidBatch(`operations[${index}].tool 不是允许的写能力: ${tool || "(empty)"}`);
    }
    const args = raw.arguments === undefined ? {} : raw.arguments;
    if (!isRecord(args)) {
      invalidBatch(`operations[${index}].arguments 必须是对象`);
    }
    return { tool, arguments: { ...args } };
  });
}

function readProjectId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "MCP_INVALID_ARGUMENTS", "参数 projectId 必须是非空字符串");
  }
  return value.trim();
}

function readExpectedUpdatedAt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function batchCapabilities(
  controller: McpController,
): McpCapability[] {
  return [
    {
      name: "batch_apply",
      title: {
        "zh-CN": "批量执行画布操作",
        "en-US": "Apply canvas batch",
      },
      description: {
        "zh-CN":
          "按顺序执行最多 200 个画布、布局或行为写操作。每个操作复用对应 MCP 能力的完整参数校验与权限检查。",
        "en-US":
          "Execute up to 200 canvas, layout, or behavior write operations in order. Each operation reuses the full validation and permission checks of its MCP capability.",
      },
      usage: {
        "zh-CN":
          'operations 是 JSON 数组：[{"tool":"update_page","arguments":{"pageId":"n1","styles":"{\\"left\\":\\"24px\\"}"}}]。所有操作必须属于同一 projectId。expectedUpdatedAt 会用于第一个操作，之后自动使用上一操作返回的 updatedAt 继续做并发保护。注意：这是顺序执行，不是数据库事务；中途失败时前面的操作已生效。',
        "en-US":
          'operations is a JSON array: [{"tool":"update_page","arguments":{"pageId":"n1","styles":"{\\"left\\":\\"24px\\"}"}}]. Every operation must belong to the same projectId. expectedUpdatedAt is applied to the first operation, then each later operation uses the updatedAt returned by the previous one. Operations run sequentially and are not a database transaction; earlier operations remain applied if a later one fails.',
      },
      returns: {
        "zh-CN":
          "applied 数量、每个操作的结果（含创建的资源 id）以及最终 updatedAt。",
        "en-US":
          "The applied count, per-operation results (including created resource ids), and the final updatedAt.",
      },
      category: "lint",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description: "Project id shared by every operation.",
            minLength: 1,
            maxLength: 120,
          },
          operations: {
            type: "string",
            description:
              'JSON array of {"tool":"update_page","arguments":{...}} entries. Tools: create_page, update_page, delete_page, duplicate_page, update_page_styles, update_page_widget, update_page_data, create_link, update_link, delete_link, move_page, resize_page, set_page_parent, reorder_layers, set_layout, batch_update_layout, update_behavior, update_runtime_variables.',
            maxLength: MAX_BATCH_ARGUMENT_LENGTH,
          },
          expectedUpdatedAt: {
            type: "number",
            description:
              "Optional optimistic concurrency check for the first operation.",
          },
        },
        required: ["projectId", "operations"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            projectId: "project-uuid",
            expectedUpdatedAt: 1790000000000,
            operations:
              '[{"tool":"set_layout","arguments":{"pageId":"n1","layout":"{\\"left\\":\\"24px\\",\\"top\\":\\"24px\\"}"}},{"tool":"update_page_styles","arguments":{"pageId":"n1","styles":"{\\"background-color\\":\\"#0f172a\\"}"}}]',
          },
        },
      ],
      async execute(context, args) {
        const projectId = readProjectId(args.projectId);
        const operations = parseOperations(args.operations);
        operations.forEach((operation, index) => {
          if (
            operation.arguments.projectId !== undefined &&
            operation.arguments.projectId !== projectId
          ) {
            invalidBatch(
              `operations[${index}] 的 projectId 与批量项目不一致`,
            );
          }
        });
        let revision = readExpectedUpdatedAt(args.expectedUpdatedAt);
        const results: {
          tool: string;
          data: Record<string, unknown>;
        }[] = [];

        for (let index = 0; index < operations.length; index += 1) {
          const operation = operations[index];
          const operationArgs: Record<string, unknown> = {
            ...operation.arguments,
            projectId,
          };
          if (
            operation.arguments.projectId !== undefined &&
            operation.arguments.projectId !== projectId
          ) {
            invalidBatch(
              `operations[${index}] 的 projectId 与批量项目不一致`,
            );
          }
          if (revision !== undefined) {
            // Batch operations are revision-chained. Override any stale
            // per-operation value so a single expectedUpdatedAt protects the
            // whole sequence.
            operationArgs.expectedUpdatedAt = revision;
          }

          try {
            const result = await controller.invoke(
              context.apiKey,
              context.user,
              context.origin,
              operation.tool,
              operationArgs,
            );
            results.push({ tool: operation.tool, data: result.data });
            const updatedAt = result.data.updatedAt;
            revision =
              typeof updatedAt === "number" ? updatedAt : undefined;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "未知错误";
            throw new ApiError(
              400,
              "MCP_BATCH_APPLY_FAILED",
              `批量操作第 ${index + 1} 项（${operation.tool}）失败，已应用 ${results.length} 项：${message}`,
            );
          }
        }

        return {
          projectId,
          applied: results.length,
          updatedAt: revision ?? null,
          results,
        };
      },
    },
  ];
}
