import type { FastifyReply, FastifyRequest } from "fastify";

import { SESSION_COOKIE, SESSION_TTL_MS, isProduction } from "../config.js";

export function readSessionToken(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;

    const name = pair.slice(0, separator).trim();
    if (name !== SESSION_COOKIE) continue;

    const value = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || null;
    } catch {
      return value || null;
    }
  }

  return null;
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];

  if (isProduction) parts.push("Secure");
  reply.header("set-cookie", parts.join("; "));
}

export function clearSessionCookie(reply: FastifyReply) {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (isProduction) parts.push("Secure");
  reply.header("set-cookie", parts.join("; "));
}
