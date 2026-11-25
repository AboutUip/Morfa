import type { FastifyInstance, FastifyRequest } from "fastify";

import { readSessionToken } from "../lib/cookies.js";
import { ApiError } from "../lib/errors.js";
import { requireActiveUser } from "../services/auth.js";
import {
  createApiKey,
  listApiKeys,
  removeApiKey,
  updateApiKey,
} from "../services/apiKeys.js";

function readBody(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ApiError(400, "INVALID_INPUT", "权限设置不正确");
  }
  return value;
}

export function registerApiKeyRoutes(app: FastifyInstance) {
  app.get("/api/me/api-keys", async (request, reply) => {
    const session = requireActiveUser(readSessionToken(request));
    return reply
      .header("cache-control", "no-store")
      .send({ keys: listApiKeys(session.row.id) });
  });

  app.post("/api/me/api-keys", async (request, reply) => {
    const session = requireActiveUser(readSessionToken(request));
    const body = readBody(request);

    const { key, token } = createApiKey(session.row.id, {
      name: readString(body.name),
      allowVCode: readOptionalBoolean(body.allowVCode) === true,
      allowPassword: readOptionalBoolean(body.allowPassword) === true,
    });

    return reply
      .header("cache-control", "no-store")
      .code(201)
      .send({ key, apiKey: token });
  });

  app.patch<{ Params: { id: string } }>(
    "/api/me/api-keys/:id",
    async (request, reply) => {
      const session = requireActiveUser(readSessionToken(request));
      const body = readBody(request);
      const name =
        body.name === undefined ? undefined : readString(body.name);

      return reply
        .header("cache-control", "no-store")
        .send({
          key: updateApiKey(session.row.id, request.params.id, {
            name,
            allowVCode: readOptionalBoolean(body.allowVCode),
            allowPassword: readOptionalBoolean(body.allowPassword),
          }),
        });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/me/api-keys/:id",
    async (request, reply) => {
      const session = requireActiveUser(readSessionToken(request));
      removeApiKey(session.row.id, request.params.id);
      return reply.code(204).send();
    },
  );
}
