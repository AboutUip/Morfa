import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { ASSETS_DIR } from "../config.js";
import { mimeTypeForAssetFile } from "../services/projectAssets.js";

const ASSET_FILENAME_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp|gif)$/i;

export function registerAssetUploadRoutes(app: FastifyInstance) {
  app.get<{ Params: { filename: string } }>(
    "/uploads/assets/:filename",
    async (request, reply) => {
      const { filename } = request.params;

      if (!ASSET_FILENAME_PATTERN.test(filename)) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "素材不存在" },
        });
      }

      const filePath = path.join(ASSETS_DIR, filename);
      try {
        await fs.access(filePath);
      } catch {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "素材不存在" },
        });
      }

      const mimeType = mimeTypeForAssetFile(filename);
      if (!mimeType) {
        return reply.code(404).send({
          error: { code: "NOT_FOUND", message: "素材不存在" },
        });
      }

      return reply
        .type(mimeType)
        .header("cache-control", "public, max-age=86400")
        .send(createReadStream(filePath));
    },
  );
}
