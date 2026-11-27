import { ApiError } from "../lib/errors.js";
import type {
  McpInputSchema,
  McpObjectSchema,
  McpPropertySchema,
} from "./types.js";

function invalid(field: string, message: string): never {
  throw new ApiError(
    400,
    "MCP_INVALID_ARGUMENTS",
    `参数 ${field} ${message}`,
  );
}

function validateProperty(
  field: string,
  value: unknown,
  schema: McpPropertySchema,
) {
  if (schema.type === "string") {
    if (typeof value !== "string") invalid(field, "必须是字符串");
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      invalid(field, `长度不能小于 ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      invalid(field, `长度不能超过 ${schema.maxLength}`);
    }
  } else if (schema.type === "boolean") {
    if (typeof value !== "boolean") invalid(field, "必须是布尔值");
  } else if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      invalid(field, "必须是数字");
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      invalid(field, `不能小于 ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      invalid(field, `不能大于 ${schema.maximum}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) invalid(field, "必须是数组");
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      invalid(field, `至少需要 ${schema.minItems} 项`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      invalid(field, `不能超过 ${schema.maxItems} 项`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        validateObject(`${field}[${index}]`, item, schema.items as McpObjectSchema);
      });
    }
    return;
  }

  if (schema.enum && !schema.enum.includes(value as string)) {
    invalid(field, `必须是 ${schema.enum.join(" / ")} 之一`);
  }
}

function validateObject(
  field: string,
  value: unknown,
  schema: McpObjectSchema,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(field, "必须是对象");
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(key in schema.properties)) {
      invalid(field, `包含未知字段 ${key}`);
    }
  }
  for (const key of schema.required ?? []) {
    if (record[key] === undefined) invalid(`${field}.${key}`, "不能为空");
  }
  for (const [key, property] of Object.entries(schema.properties)) {
    if (record[key] === undefined) continue;
    validateProperty(`${field}.${key}`, record[key], property);
  }
}

export function validateArguments(
  schema: McpInputSchema,
  input: unknown,
): Record<string, unknown> {
  if (input === undefined || input === null) {
    input = {};
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(
      400,
      "MCP_INVALID_ARGUMENTS",
      "工具参数必须是一个对象",
    );
  }

  const values = input as Record<string, unknown>;

  for (const field of Object.keys(values)) {
    if (!(field in schema.properties)) {
      throw new ApiError(
        400,
        "MCP_INVALID_ARGUMENTS",
        `未知参数 ${field}`,
      );
    }
  }

  for (const field of schema.required ?? []) {
    if (values[field] === undefined) {
      throw new ApiError(
        400,
        "MCP_INVALID_ARGUMENTS",
        `缺少必填参数 ${field}`,
      );
    }
  }

  const normalized: Record<string, unknown> = {};

  for (const [field, propertySchema] of Object.entries(schema.properties)) {
    const value = values[field];
    if (value === undefined) continue;
    validateProperty(field, value, propertySchema);
    normalized[field] = value;
  }

  return normalized;
}
