import { Readable } from "node:stream";

import type { FastifyInstance, FastifyRequest } from "fastify";

import { readSessionToken } from "../lib/cookies.js";
import { ApiError } from "../lib/errors.js";
import { requireActiveUser } from "../services/auth.js";
import {
  createProject,
  joinProject,
  listProjects,
} from "../services/projects.js";
import { streamProjectCreation } from "../services/projectStream.js";

const PROJECT_BODY_LIMIT = 4 * 1024 * 1024;

function readBody(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function projectInput(body: Record<string, unknown>) {
  return {
    type: readString(body.type),
    name: readString(body.name),
    description: readString(body.description),
    visibility: readString(body.visibility),
    iconDataUrl:
      typeof body.iconDataUrl === "string" ? body.iconDataUrl : null,
    requestId:
      typeof body.requestId === "string" ? body.requestId : null,
  };
}

export function registerProjectRoutes(app: FastifyInstance) {
  app.get("/api/me/projects", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    return { projects: listProjects(session.row.id) };
  });

  app.post(
    "/api/me/projects",
    { bodyLimit: PROJECT_BODY_LIMIT },
    async (request, reply) => {
      const session = requireActiveUser(readSessionToken(request));
      const project = await createProject(
        session.row,
        projectInput(readBody(request)),
      );
      return reply.code(201).send({ project });
    },
  );

  app.post(
    "/api/me/projects/stream",
    { bodyLimit: PROJECT_BODY_LIMIT },
    async (request, reply) => {
      const session = requireActiveUser(readSessionToken(request));

      reply
        .header("content-type", "application/x-xaiop; charset=utf-8")
        .header("cache-control", "no-store")
        .header("x-accel-buffering", "no");

      return reply.send(
        Readable.from(
          streamProjectCreation(session.row, projectInput(readBody(request))),
        ),
      );
    },
  );

  app.post("/api/me/projects/join", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    const code = readString(readBody(request).code);
    if (!code) {
      throw new ApiError(
        400,
        "PROJECT_CODE_REQUIRED",
        "请输入项目邀请码",
      );
    }
    return { project: joinProject(session.row, code) };
  });
}
