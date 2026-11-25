import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { AVATARS_DIR, PROJECT_ICONS_DIR } from "../config.js";
import { mimeTypeForAvatarFile } from "../services/avatar.js";
import { mimeTypeForProjectIconFile } from "../services/projectIcons.js";

const FILENAME_PATTERN = /^[a-f0-9-]{36}\.(png|jpg|webp)$/i;

export function registerUploadRoutes(app: FastifyInstance) {
  app.get<{ Params: { filename: string } }>(
    "/uploads/avatars/:filename",
    async (request, reply) => {
      const { filename } = request.params;

      if (!FILENAME_PATTERN.test(filename)) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "头像不存在" },
        });
      }

      const filePath = path.join(AVATARS_DIR, filename);
      try {
        await fs.access(filePath);
      } catch {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "头像不存在" },
        });
      }

      const mimeType = mimeTypeForAvatarFile(filename);
      if (!mimeType) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "头像不存在" },
        });
      }

      return reply
        .type(mimeType)
        .header("cache-control", "public, max-age=86400")
        .send(createReadStream(filePath));
    },
  );

  app.get<{ Params: { filename: string } }>(
    "/uploads/projects/:filename",
    async (request, reply) => {
      const { filename } = request.params;

      if (!FILENAME_PATTERN.test(filename)) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "项目图标不存在" },
        });
      }

      const filePath = path.join(PROJECT_ICONS_DIR, filename);
      try {
        await fs.access(filePath);
      } catch {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "项目图标不存在" },
        });
      }

      const mimeType = mimeTypeForProjectIconFile(filename);
      if (!mimeType) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "项目图标不存在" },
        });
      }

      return reply
        .type(mimeType)
        .header("cache-control", "public, max-age=86400")
        .send(createReadStream(filePath));
    },
  );
}
