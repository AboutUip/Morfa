import type { FastifyInstance, FastifyRequest } from "fastify";

import { EXPORT_ARCHIVE_MAX_BYTES } from "../config.js";
import { deleteSession } from "../db/users.js";
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from "../lib/cookies.js";
import { ApiError } from "../lib/errors.js";
import {
  completeVCodeSetup,
  getSessionUser,
  loginUser,
  logout,
  registerUser,
  toPublicUser,
} from "../services/auth.js";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>)
    : {};
}

interface RegisterParts {
  fields: Record<string, string>;
  avatar: Buffer | null;
  avatarMimeType: string;
  archive: Buffer | null;
}

async function readRegisterParts(
  request: FastifyRequest,
): Promise<RegisterParts> {
  const fields: Record<string, string> = Object.create(null);
  let avatar: Buffer | null = null;
  let avatarMimeType = "";
  let archive: Buffer | null = null;

  const parts = request.parts({
    limits: {
      fileSize: EXPORT_ARCHIVE_MAX_BYTES,
      files: 2,
      fields: 24,
      fieldSize: 8192,
      parts: 28,
    },
  });

  for await (const part of parts) {
    if (part.type === "file") {
      if (part.fieldname === "avatar") {
        avatarMimeType = part.mimetype;
        avatar = await part.toBuffer();
      } else if (part.fieldname === "archive") {
        archive = await part.toBuffer();
      } else {
        await part.toBuffer();
      }
      continue;
    }

    fields[part.fieldname] = String(part.value);
  }

  return { fields, avatar, avatarMimeType, archive };
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/me", async (request, reply) => {
    const session = getSessionUser(readSessionToken(request));
    if (!session) return { user: null };

    if (
      session.row.status !== "active" ||
      !session.row.vcode_hash
    ) {
      deleteSession(session.tokenHash);
      clearSessionCookie(reply);
      return { user: null };
    }

    return { user: toPublicUser(session.row) };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    logout(readSessionToken(request));
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = readBody(request);

    const result = await loginUser({
      loginAccount: readString(body.loginAccount),
      password: readString(body.password),
    });

    if (result.kind === "vcode_setup_required") {
      return {
        requiresVCodeSetup: true,
        setupToken: result.setupToken,
        expiresAt: result.expiresAt,
        preview: result.preview,
      };
    }

    setSessionCookie(reply, result.token);
    return { user: result.user };
  });

  app.post("/api/auth/vcode-setup", async (request, reply) => {
    const body = readBody(request);

    const result = await completeVCodeSetup({
      setupToken: readString(body.setupToken),
      code: readString(body.code),
    });

    setSessionCookie(reply, result.token);
    return { user: result.user };
  });

  app.post("/api/auth/register", async (request, reply) => {
    const { fields, avatar, avatarMimeType, archive } =
      await readRegisterParts(request);

    const importOriginalAccount =
      fields.importOriginalAccount?.trim() ?? "";

    let importInput:
      | { originalAccount: string; archive: Buffer }
      | undefined;

    if (importOriginalAccount || archive) {
      if (!importOriginalAccount) {
        throw new ApiError(
          400,
          "IMPORT_ACCOUNT_REQUIRED",
          "请输入原登录账号",
        );
      }

      if (!archive) {
        throw new ApiError(
          400,
          "IMPORT_ARCHIVE_REQUIRED",
          "请选择数据包",
        );
      }

      importInput = {
        originalAccount: importOriginalAccount,
        archive,
      };
    }

    const result = await registerUser({
      nickname: fields.nickname ?? "",
      loginAccount: fields.loginAccount ?? "",
      password: fields.password ?? "",
      confirmPassword: fields.confirmPassword ?? "",
      vcode: fields.vcode ?? "",
      avatar,
      avatarMimeType,
      import: importInput,
    });

    setSessionCookie(reply, result.token);
    return reply.code(201).send({
      user: result.user,
      importedProjectCount: result.importedProjectCount,
    });
  });
}
