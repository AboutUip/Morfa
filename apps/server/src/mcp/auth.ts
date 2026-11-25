import type { FastifyRequest } from "fastify";

import { ApiError } from "../lib/errors.js";
import {
  authenticateApiKeyToken,
  type AuthenticatedApiKey,
} from "../services/apiKeys.js";

function readAuthorizationToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header === "string") {
    const match = header.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (token) return token;
  }

  const apiKeyHeader = request.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  return null;
}

export function requireApiKey(
  request: FastifyRequest,
): AuthenticatedApiKey {
  const token = readAuthorizationToken(request);
  if (!token) {
    throw new ApiError(
      401,
      "API_KEY_REQUIRED",
      "缺少 API Key，请在 Authorization 中使用 Bearer <key>",
    );
  }

  return authenticateApiKeyToken(token);
}

export function requestOrigin(request: FastifyRequest): string {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const forwardedHost = request.headers["x-forwarded-host"];
  const host =
    (typeof forwardedHost === "string"
      ? forwardedHost.split(",")[0]?.trim()
      : undefined) ??
    request.headers.host ??
    "127.0.0.1:3001";
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim() || request.protocol
      : request.protocol;

  return `${protocol}://${host}`;
}
