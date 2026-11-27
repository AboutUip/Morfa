import type { FastifyInstance } from "fastify";

import { getScreenshotArtifact } from "../services/screenshotArtifacts.js";

const SCREENSHOT_TOKEN_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function registerScreenshotRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>(
    "/api/screenshots/:token",
    async (request, reply) => {
      const { token } = request.params;

      if (!SCREENSHOT_TOKEN_PATTERN.test(token)) {
        return reply.code(404).send({
          error: { code: "SCREENSHOT_NOT_FOUND", message: "截图不存在" },
        });
      }

      const lookup = getScreenshotArtifact(token);
      if (lookup.status !== "ok") {
        return reply.code(lookup.status === "expired" ? 410 : 404).send({
          error: {
            code:
              lookup.status === "expired"
                ? "SCREENSHOT_EXPIRED"
                : "SCREENSHOT_NOT_FOUND",
            message:
              lookup.status === "expired"
                ? "截图链接已过期"
                : "截图不存在",
          },
        });
      }

      const artifact = lookup.artifact;
      const buffer = Buffer.from(artifact.data, "base64");
      return reply
        .type(artifact.mimeType)
        .header("cache-control", "private, max-age=300")
        .header(
          "content-disposition",
          'inline; filename="morfa-screenshot.png"',
        )
        .header("content-length", String(buffer.byteLength))
        .send(buffer);
    },
  );
}
