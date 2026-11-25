import { createReadStream } from "node:fs";
import fs from "node:fs/promises";

import type { FastifyInstance, FastifyRequest } from "fastify";

import { clearSessionCookie, readSessionToken } from "../lib/cookies.js";
import { ApiError } from "../lib/errors.js";
import { requireActiveUser, toPublicUser } from "../services/auth.js";
import {
  createExportForUser,
  getExportSummary,
  getValidExportRow,
} from "../services/dataTransfer.js";
import { exportFilePath } from "../services/exportArchive.js";
import {
  cancelAccount,
  changePassword,
  resetPassword,
  updateAvatar,
  updateNickname,
  verifyCurrentPassword,
} from "../services/profile.js";
import {
  verifyVCodeForUser,
  type TicketPurpose,
} from "../services/vcode.js";

function readBody(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readPurpose(value: unknown): TicketPurpose {
  if (
    value === "password_reset" ||
    value === "export" ||
    value === "cancel" ||
    value === "reveal_api_key"
  ) {
    return value;
  }

  throw new ApiError(400, "INVALID_INPUT", "验证用途不正确");
}

async function readAvatarPart(request: FastifyRequest) {
  let avatar: Buffer | null = null;
  let mimeType = "";

  const parts = request.parts({
    limits: {
      files: 1,
      fields: 2,
      fieldSize: 1024,
      parts: 4,
    },
  });

  for await (const part of parts) {
    if (part.type === "file") {
      if (part.fieldname === "avatar") {
        mimeType = part.mimetype;
        avatar = await part.toBuffer();
      } else {
        await part.toBuffer();
      }
      continue;
    }
  }

  return { avatar, mimeType };
}

export function registerAccountRoutes(app: FastifyInstance) {
  app.patch("/api/me/profile", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    const body = readBody(request);
    const updated = updateNickname(
      session.row,
      readString(body.nickname),
    );

    return { user: toPublicUser(updated) };
  });

  app.post("/api/me/avatar", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    const { avatar, mimeType } = await readAvatarPart(request);

    if (!avatar) {
      throw new ApiError(400, "AVATAR_REQUIRED", "请选择头像文件");
    }

    const updated = await updateAvatar(session.row, avatar, mimeType);
    return { user: toPublicUser(updated) };
  });

  app.post("/api/me/password/verify", async (request, reply) => {
    const session = requireActiveUser(readSessionToken(request));
    const body = readBody(request);

    await verifyCurrentPassword(
      session.row,
      readString(body.currentPassword),
    );

    return reply.code(204).send();
  });

  app.post("/api/me/password", async (request, reply) => {
    const session = requireActiveUser(readSessionToken(request));
    const body = readBody(request);

    await changePassword(session.row, session.tokenHash, {
      currentPassword: readString(body.currentPassword),
      newPassword: readString(body.newPassword),
    });

    return reply.code(204).send();
  });

  app.post("/api/me/vcode/verify", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    const body = readBody(request);
    const purpose = readPurpose(body.purpose);

    return verifyVCodeForUser(
      session.row,
      readString(body.code),
      purpose,
    );
  });

  app.post("/api/me/password/forgot", async (request, reply) => {
    const session = requireActiveUser(readSessionToken(request));
    const body = readBody(request);

    await resetPassword(session.row, session.tokenHash, {
      ticket: readString(body.ticket),
      newPassword: readString(body.newPassword),
    });

    return reply.code(204).send();
  });

  app.get("/api/me/export", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    return { export: getExportSummary(session.row.id) };
  });

  app.post("/api/me/export", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    const body = readBody(request);

    const summary = await createExportForUser(
      session.row,
      readString(body.ticket),
    );

    return { export: summary };
  });

  app.get("/api/me/export/download", async (request, reply) => {
    const session = requireActiveUser(readSessionToken(request));
    const row = getValidExportRow(session.row.id);

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
    const downloadName = `morfa-export-${date}.morfa`;

    return reply
      .type("application/octet-stream")
      .header("content-length", String(row.file_size))
      .header(
        "content-disposition",
        `attachment; filename="${downloadName}"`,
      )
      .header("cache-control", "no-store")
      .send(createReadStream(filePath));
  });

  app.post("/api/me/cancel", async (request, reply) => {
    const session = requireActiveUser(readSessionToken(request));
    const body = readBody(request);

    await cancelAccount(session.row, {
      ticket: readString(body.ticket),
      password: readString(body.password),
    });

    clearSessionCookie(reply);
    return reply.code(204).send();
  });
}
