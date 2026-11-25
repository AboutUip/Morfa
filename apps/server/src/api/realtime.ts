import type { FastifyInstance, FastifyRequest } from "fastify";

import { isProduction } from "../config.js";
import { readSessionToken } from "../lib/cookies.js";
import { ApiError } from "../lib/errors.js";
import { requireActiveUser } from "../services/auth.js";
import { REALTIME_CLOSE_CODES } from "@morfa/shared/realtime";
import { realtimeGateway } from "../realtime/index.js";

function allowedOrigins(request: FastifyRequest): Set<string> {
  const origins = new Set<string>();
  const configured = process.env.APP_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) origins.add(configured);

  const host = request.headers.host;
  if (host) {
    origins.add(`http://${host}`);
    origins.add(`https://${host}`);
  }

  if (!isProduction) {
    origins.add("http://127.0.0.1:5173");
    origins.add("http://localhost:5173");
    origins.add("http://127.0.0.1:4173");
    origins.add("http://localhost:4173");
  }

  return origins;
}

function assertAllowedOrigin(request: FastifyRequest) {
  const origin = request.headers.origin;
  if (!origin) return;
  if (!allowedOrigins(request).has(origin)) {
    throw new ApiError(
      403,
      "REALTIME_ORIGIN_FORBIDDEN",
      "不允许的实时连接来源",
    );
  }
}

export function registerRealtimeRoutes(app: FastifyInstance) {
  app.get(
    "/api/realtime",
    { websocket: true },
    (socket, request) => {
      try {
        assertAllowedOrigin(request);
      } catch {
        socket.close(
          REALTIME_CLOSE_CODES.forbidden,
          "ORIGIN_FORBIDDEN",
        );
        return;
      }

      let session;
      try {
        session = requireActiveUser(readSessionToken(request));
      } catch {
        socket.close(
          REALTIME_CLOSE_CODES.unauthorized,
          "UNAUTHORIZED",
        );
        return;
      }

      realtimeGateway.attach({
        socket,
        user: session.row,
        sessionTokenHash: session.tokenHash,
      });
    },
  );
}
