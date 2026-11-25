import { createReadStream } from "node:fs";
import fs from "node:fs/promises";

import type { FastifyInstance, FastifyRequest } from "fastify";

import { readSessionToken } from "../lib/cookies.js";
import { ApiError } from "../lib/errors.js";
import { requireActiveUser } from "../services/auth.js";
import {
  getValidExportRow,
} from "../services/dataTransfer.js";
import { exportFilePath } from "../services/exportArchive.js";
import { requireApiKey, requestOrigin } from "../mcp/auth.js";
import {
  generateLlmsTxt,
} from "../mcp/docs.js";
import type { McpController } from "../mcp/controller.js";
import { permissionsFromKey } from "../mcp/controller.js";
import type { McpCategory } from "../mcp/types.js";

const MCP_BODY_LIMIT = 6 * 1024 * 1024;
const PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18"];
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

type JsonRpcId = string | number | null;

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
) {
  return {
    jsonrpc: "2.0" as const,
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

function readParams(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toolErrorContent(error: unknown) {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(500, "MCP_INTERNAL_ERROR", "MCP 能力执行失败");
  const payload = {
    error: {
      code: apiError.code,
      message: apiError.message,
    },
  };

  return {
    content: [
      {
        type: "text" as const,
        text: `${apiError.code}: ${apiError.message}`,
      },
    ],
    structuredContent: payload,
    isError: true,
  };
}

async function handleRpc(
  controller: McpController,
  request: JsonRpcRequest,
  apiKey: ReturnType<typeof requireApiKey>["key"],
  user: ReturnType<typeof requireApiKey>["user"],
  origin: string,
) {
  const hasId = Object.prototype.hasOwnProperty.call(request, "id");
  const id: JsonRpcId =
    typeof request.id === "string" || typeof request.id === "number"
      ? request.id
      : null;

  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return hasId
      ? rpcError(
          id,
          -32600,
          "Invalid Request: jsonrpc must be 2.0 and method is required",
        )
      : null;
  }

  const method = request.method;
  const params = readParams(request.params);

  if (method.startsWith("notifications/")) {
    return null;
  }

  if (method === "initialize") {
    const requested = params.protocolVersion;
    const protocolVersion =
      typeof requested === "string" &&
      PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL_VERSION;

    return rpcResult(id, {
      protocolVersion,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: "morfa-mcp",
        version: "0.1.0",
      },
      instructions:
        "Morfa MCP exposes account, appearance, export, and model-provider capabilities. Use search_mcp_capabilities to discover tools, get_mcp_capability for detailed usage, and get_mcp_status to inspect the current API key permissions. tools/list only includes capabilities enabled for this API key.",
    });
  }

  if (method === "ping") {
    return rpcResult(id, {});
  }

  if (method === "tools/list") {
    return rpcResult(id, {
      tools: controller.listTools(permissionsFromKey(apiKey)),
    });
  }

  if (method === "tools/call") {
    const name = params.name;
    if (typeof name !== "string" || !name) {
      return rpcError(id, -32602, "Invalid params: tool name is required");
    }

    try {
      const invocation = await controller.invoke(
        apiKey,
        user,
        origin,
        name,
        params.arguments,
      );
      return rpcResult(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(invocation.data, null, 2),
          },
        ],
        structuredContent: invocation.data,
        isError: false,
      });
    } catch (error) {
      return rpcResult(id, toolErrorContent(error));
    }
  }

  if (method === "resources/list") {
    return rpcResult(id, { resources: [] });
  }

  if (method === "prompts/list") {
    return rpcResult(id, { prompts: [] });
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}

export function registerMcpRoutes(
  app: FastifyInstance,
  controller: McpController,
) {
  app.post(
    "/mcp",
    { bodyLimit: MCP_BODY_LIMIT },
    async (request, reply) => {
      const { key, user } = requireApiKey(request);
      const origin = requestOrigin(request);
      const payload = request.body;

      reply
        .header("cache-control", "no-store")
        .header("x-accel-buffering", "no");

      if (Array.isArray(payload)) {
        const responses = (
          await Promise.all(
            payload.map((entry) =>
              handleRpc(
                controller,
                entry && typeof entry === "object"
                  ? (entry as JsonRpcRequest)
                  : {},
                key,
                user,
                origin,
              ),
            ),
          )
        ).filter((entry) => entry !== null);

        if (responses.length === 0) {
          return reply.code(202).send();
        }
        return reply.type("application/json").send(responses);
      }

      const response = await handleRpc(
        controller,
        payload && typeof payload === "object"
          ? (payload as JsonRpcRequest)
          : {},
        key,
        user,
        origin,
      );

      if (!response) {
        return reply.code(202).send();
      }

      return reply.type("application/json").send(response);
    },
  );

  app.get("/api/mcp/capabilities", async (request) => {
    const { key } = requireApiKey(request);
    const query = request.query as Record<string, unknown>;
    const category =
      typeof query.category === "string"
        ? (query.category as McpCategory)
        : undefined;

    const capabilities = controller.list(permissionsFromKey(key), {
      query: typeof query.q === "string" ? query.q : undefined,
      category,
      availableOnly: query.availableOnly !== "false",
    });

    return { count: capabilities.length, capabilities };
  });

  app.get<{ Params: { name: string } }>(
    "/api/mcp/capabilities/:name",
    async (request) => {
      const { key } = requireApiKey(request);
      const capability = controller.describe(
        request.params.name,
        permissionsFromKey(key),
      );

      if (!capability) {
        throw new ApiError(
          404,
          "MCP_CAPABILITY_NOT_FOUND",
          "MCP 能力不存在",
        );
      }

      return { capability };
    },
  );

  app.post<{ Params: { name: string } }>(
    "/api/mcp/capabilities/:name/call",
    { bodyLimit: MCP_BODY_LIMIT },
    async (request) => {
      const { key, user } = requireApiKey(request);
      const body = request.body;
      const args =
        body &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        "arguments" in body
          ? (body as Record<string, unknown>).arguments
          : body;

      const invocation = await controller.invoke(
        key,
        user,
        requestOrigin(request),
        request.params.name,
        args,
      );

      return { ok: true, name: invocation.name, data: invocation.data };
    },
  );

  app.get("/api/mcp/export/latest", async (request, reply) => {
    const { user } = requireApiKey(request);
    const row = getValidExportRow(user.id);

    if (!row) {
      throw new ApiError(404, "EXPORT_NOT_FOUND", "没有可下载的导出包");
    }

    const filePath = exportFilePath(row.file_name);

    try {
      await fs.access(filePath);
    } catch {
      throw new ApiError(410, "EXPORT_FILE_MISSING", "导出文件已不存在");
    }

    const date = new Date(row.created_at).toISOString().slice(0, 10);

    return reply
      .type("application/octet-stream")
      .header("content-length", String(row.file_size))
      .header(
        "content-disposition",
        `attachment; filename="morfa-export-${date}.morfa"`,
      )
      .header("cache-control", "no-store")
      .send(createReadStream(filePath));
  });

  app.get("/api/me/mcp/capabilities", async (request) => {
    requireActiveUser(readSessionToken(request));
    const capabilities = controller.list(null);
    return { count: capabilities.length, capabilities };
  });

  app.get<{ Params: { name: string } }>(
    "/api/me/mcp/capabilities/:name",
    async (request) => {
      requireActiveUser(readSessionToken(request));
      const capability = controller.describe(request.params.name, null);

      if (!capability) {
        throw new ApiError(
          404,
          "MCP_CAPABILITY_NOT_FOUND",
          "MCP 能力不存在",
        );
      }

      return { capability };
    },
  );

  app.get("/llms.txt", async (request, reply) => {
    return reply
      .type("text/markdown; charset=utf-8")
      .header(
        "content-disposition",
        'inline; filename="morfa-mcp-llms.txt"',
      )
      .header("cache-control", "public, max-age=300")
      .send(generateLlmsTxt(controller, requestOrigin(request)));
  });
}
