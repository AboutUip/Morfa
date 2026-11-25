import type { FastifyInstance } from "fastify";

import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from "../lib/cookies.js";
import { ApiError } from "../lib/errors.js";
import {
  getUserBySession,
  loginUser,
  logout,
  registerUser,
} from "../services/auth.js";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/me", async (request) => {
    const user = getUserBySession(readSessionToken(request));
    return { user };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    logout(readSessionToken(request));
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};

    const result = await loginUser({
      loginAccount: readString(body.loginAccount),
      password: readString(body.password),
    });

    setSessionCookie(reply, result.token);
    return { user: result.user };
  });

  app.post("/api/auth/register", async (request, reply) => {
    const fields: Record<string, string> = Object.create(null);
    let avatar: Buffer | null = null;
    let avatarMimeType = "";

    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (part.fieldname === "avatar") {
          avatarMimeType = part.mimetype;
          avatar = await part.toBuffer();
        } else {
          await part.toBuffer();
        }
        continue;
      }

      fields[part.fieldname] = String(part.value);
    }

    if (!avatar) {
      throw new ApiError(400, "AVATAR_REQUIRED", "请上传头像文件");
    }

    const result = await registerUser({
      nickname: fields.nickname ?? "",
      loginAccount: fields.loginAccount ?? "",
      password: fields.password ?? "",
      confirmPassword: fields.confirmPassword ?? "",
      avatar,
      avatarMimeType,
    });

    setSessionCookie(reply, result.token);
    return reply.code(201).send({ user: result.user });
  });
}
