import type { FastifyInstance } from "fastify";

import { ApiError } from "../lib/errors.js";
import { getProjectCanvas } from "../services/canvasDocuments.js";
import { resolveCanvasCaptureGeometry } from "../services/canvasScreenshotGeometry.js";
import { getRenderToken } from "../services/renderTokens.js";

/**
 * Public, token-scoped canvas data for the standalone web renderer.
 *
 * The token carries the owner and mode, so this route never trusts caller
 * supplied IDs. It intentionally exposes only the canvas document and the
 * geometry the render page needs.
 */
export function registerRenderRoutes(app: FastifyInstance) {
  app.get("/api/render/:token", async (request, reply) => {
    const { token } = request.params as { token: string };
    const lookup = getRenderToken(token);

    if (lookup.status === "missing") {
      throw new ApiError(
        404,
        "RENDER_TOKEN_NOT_FOUND",
        "渲染令牌不存在",
      );
    }
    if (lookup.status === "expired") {
      throw new ApiError(
        410,
        "RENDER_TOKEN_EXPIRED",
        "渲染令牌已过期",
      );
    }

    const { payload } = lookup;
    const document = getProjectCanvas(payload.userId, payload.projectId);
    const geometry = resolveCanvasCaptureGeometry(
      document.pages,
      document.links,
      payload.mode,
      payload.pageId,
    );

    reply
      .header("cache-control", "no-store, max-age=0")
      .header("pragma", "no-cache");

    return {
      pages: document.pages,
      links: document.links,
      updatedAt: document.updatedAt,
      mode: payload.mode,
      pageId: payload.pageId ?? null,
      width: geometry.width,
      height: geometry.height,
      background: geometry.background,
      ...(geometry.bounds ? { bounds: geometry.bounds } : {}),
    };
  });
}
