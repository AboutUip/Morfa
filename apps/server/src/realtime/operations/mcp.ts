import { ApiError } from "../../lib/errors.js";
import { mcpController } from "../../mcp/runtime.js";
import { realtimeOperations } from "../registry.js";

function readName(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiError(
      400,
      "REALTIME_INVALID_PAYLOAD",
      "MCP 能力参数不正确",
    );
  }

  const name = (payload as Record<string, unknown>).name;
  if (typeof name !== "string" || !name) {
    throw new ApiError(
      400,
      "REALTIME_INVALID_PAYLOAD",
      "缺少 MCP 能力名称",
    );
  }
  return name;
}

export function registerMcpRealtimeOperations() {
  realtimeOperations.register("mcp", "capabilities.list", () => {
    const capabilities = mcpController.list(null);
    return { count: capabilities.length, capabilities };
  });

  realtimeOperations.register("mcp", "capabilities.get", (_context, payload) => {
    const capability = mcpController.describe(readName(payload), null);
    if (!capability) {
      throw new ApiError(
        404,
        "MCP_CAPABILITY_NOT_FOUND",
        "MCP 能力不存在",
      );
    }
    return { capability };
  });
}
