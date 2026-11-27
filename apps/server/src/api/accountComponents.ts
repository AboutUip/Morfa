import type { FastifyInstance, FastifyRequest } from "fastify";

import { readSessionToken } from "../lib/cookies.js";
import { ApiError } from "../lib/errors.js";
import {
  deleteAccountComponent,
  getAccountComponent,
  importAccountComponent,
  listAccountComponents,
  publishAccountComponent,
} from "../services/accountComponents.js";
import { requireActiveUser } from "../services/auth.js";

const COMPONENT_BODY_LIMIT = 8 * 1024 * 1024;

function readBody(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function registerAccountComponentRoutes(app: FastifyInstance) {
  app.get("/api/me/components", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    const components = listAccountComponents(session.row.id);
    return { components, count: components.length };
  });

  app.get<{ Params: { id: string } }>(
    "/api/me/components/:id",
    async (request) => {
      const session = requireActiveUser(readSessionToken(request));
      return {
        component: getAccountComponent(
          session.row.id,
          request.params.id,
        ),
      };
    },
  );

  app.post(
    "/api/me/components",
    { bodyLimit: COMPONENT_BODY_LIMIT },
    async (request, reply) => {
      const session = requireActiveUser(readSessionToken(request));
      const body = readBody(request);
      const projectId = readString(body.projectId);
      const controlId = readString(body.controlId);
      if (!projectId || !controlId) {
        throw new ApiError(
          400,
          "COMPONENT_SOURCE_REQUIRED",
          "请选择要保存的控件",
        );
      }
      const result = publishAccountComponent({
        userId: session.row.id,
        projectId,
        controlId,
        name: readString(body.name),
        description: readString(body.description),
      });
      return reply.code(result.updated ? 200 : 201).send(result);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/me/components/:id/import",
    { bodyLimit: COMPONENT_BODY_LIMIT },
    async (request) => {
      const session = requireActiveUser(readSessionToken(request));
      const projectId = readString(readBody(request).projectId);
      if (!projectId) {
        throw new ApiError(
          400,
          "COMPONENT_PROJECT_REQUIRED",
          "请选择目标项目",
        );
      }
      return importAccountComponent({
        userId: session.row.id,
        projectId,
        componentId: request.params.id,
      });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/me/components/:id",
    async (request) => {
      const session = requireActiveUser(readSessionToken(request));
      return deleteAccountComponent(
        session.row.id,
        request.params.id,
      );
    },
  );
}
