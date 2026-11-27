import { Readable } from "node:stream";

import type { FastifyInstance, FastifyRequest } from "fastify";

import { findProjectCardForUser } from "../db/projects.js";
import { ApiError } from "../lib/errors.js";
import { readSessionToken } from "../lib/cookies.js";
import { requireActiveUser } from "../services/auth.js";
import { streamAgentRun } from "../services/agentRun.js";

function readBody(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function registerAgentRoutes(app: FastifyInstance) {
  app.post<{ Params: { projectId: string } }>(
    "/api/me/projects/:projectId/agent",
    { bodyLimit: 6 * 1024 * 1024 },
    async (request, reply) => {
      const session = requireActiveUser(readSessionToken(request));
      const project = findProjectCardForUser(
        session.row.id,
        request.params.projectId,
      );
      if (!project) {
        throw new ApiError(404, "PROJECT_NOT_FOUND", "项目不存在");
      }

      const body = readBody(request);
      const abort = new AbortController();
      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) abort.abort();
      });

      const stream = Readable.from(
        (async function* () {
          try {
            for await (const event of streamAgentRun({
              user: session.row,
              origin: request.headers.origin ?? "",
              projectId: request.params.projectId,
              providerId: readString(body.providerId),
              modelId: readString(body.modelId),
              effort: body.effort,
              messages: body.messages,
              context: body.context,
              signal: abort.signal,
            })) {
              yield `${JSON.stringify(event)}\n`;
            }
          } catch (error) {
            if (abort.signal.aborted) return;
            const message =
              error instanceof ApiError
                ? error.message
                : "Agent 没有完成这次对话";
            yield `${JSON.stringify({ type: "error", message })}\n`;
          }
        })(),
      );

      return reply
        .type("application/x-ndjson; charset=utf-8")
        .header("cache-control", "no-store")
        .header("x-accel-buffering", "no")
        .send(stream);
    },
  );
}
