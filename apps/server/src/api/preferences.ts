import type { FastifyInstance, FastifyRequest } from "fastify";

import { readSessionToken } from "../lib/cookies.js";
import { requireActiveUser } from "../services/auth.js";
import {
  getUserPreferences,
  updateUserPreferences,
} from "../services/preferences.js";

function readBody(request: FastifyRequest): Record<string, unknown> {
  return request.body && typeof request.body === "object"
    ? (request.body as Record<string, unknown>)
    : {};
}

export function registerPreferencesRoutes(app: FastifyInstance) {
  app.get("/api/me/preferences", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    return { preferences: getUserPreferences(session.row.id) };
  });

  app.patch("/api/me/preferences", async (request) => {
    const session = requireActiveUser(readSessionToken(request));
    const body = readBody(request);

    return {
      preferences: updateUserPreferences(session.row.id, {
        locale: body.locale,
        themeMode: body.themeMode,
      }),
    };
  });
}
