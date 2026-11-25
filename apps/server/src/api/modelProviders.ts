import type { FastifyInstance, FastifyRequest } from "fastify";

import { readSessionToken } from "../lib/cookies.js";
import { requireActiveUser } from "../services/auth.js";
import {
  createModelProvider,
  listModelProviders,
  removeModelProvider,
  revealModelProviderKey,
  syncModelProvider,
} from "../services/modelProviders.js";

function readBody(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function registerModelProviderRoutes(app: FastifyInstance) {
  app.get("/api/me/model-providers", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    return { providers: listModelProviders(session.row.id) };
  });

  app.post("/api/me/model-providers", async (request, reply) => {
    const session = requireActiveUser(readSessionToken(request));
    const body = readBody(request);

    const provider = await createModelProvider(session.row, {
      name: readString(body.name),
      protocol: readString(body.protocol),
      baseUrl: readString(body.baseUrl),
      apiKey: readString(body.apiKey),
    });

    return reply.code(201).send({ provider });
  });

  app.post<{ Params: { id: string } }>(
    "/api/me/model-providers/:id/sync",
    async (request) => {
      const session = requireActiveUser(readSessionToken(request));
      const provider = await syncModelProvider(
        session.row,
        request.params.id,
      );
      return { provider };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/me/model-providers/:id",
    async (request, reply) => {
      const session = requireActiveUser(readSessionToken(request));
      removeModelProvider(session.row, request.params.id);
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/me/model-providers/:id/reveal-key",
    async (request, reply) => {
      const session = requireActiveUser(readSessionToken(request));
      const body = readBody(request);

      const apiKey = revealModelProviderKey(
        session.row,
        request.params.id,
        readString(body.ticket),
      );

      return reply
        .header("cache-control", "no-store")
        .send({ apiKey });
    },
  );
}
