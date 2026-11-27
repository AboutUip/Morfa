import { randomUUID } from "node:crypto";

export type RenderTokenMode = "page" | "node" | "canvas";

export interface RenderTokenInput {
  userId: string;
  projectId: string;
  mode: RenderTokenMode;
  pageId?: string;
  scale: number;
}

export interface RenderTokenPayload extends RenderTokenInput {
  expiresAt: number;
}

export type RenderTokenLookup =
  | { status: "ok"; payload: RenderTokenPayload }
  | { status: "expired" }
  | { status: "missing" };

const RENDER_TOKEN_TTL_MS = 2 * 60 * 1000;
const MAX_RENDER_TOKENS = 500;

const tokens = new Map<string, RenderTokenPayload>();

function pruneExpired(now: number) {
  for (const [token, payload] of tokens) {
    if (payload.expiresAt <= now) tokens.delete(token);
  }
}

/**
 * Render tokens are short-lived, unguessable capabilities that let a headless
 * browser load project canvas data without a session cookie. They are kept in
 * memory only: a server restart intentionally invalidates every pending shot.
 */
export function createRenderToken(input: RenderTokenInput): string {
  const now = Date.now();
  pruneExpired(now);

  while (tokens.size >= MAX_RENDER_TOKENS) {
    const oldest = tokens.keys().next();
    if (oldest.done) break;
    tokens.delete(oldest.value);
  }

  let token = randomUUID();
  while (tokens.has(token)) token = randomUUID();

  tokens.set(token, {
    ...input,
    expiresAt: now + RENDER_TOKEN_TTL_MS,
  });
  return token;
}

export function getRenderToken(token: string): RenderTokenLookup {
  const now = Date.now();
  const payload = tokens.get(token);

  if (payload && payload.expiresAt <= now) {
    tokens.delete(token);
    pruneExpired(now);
    return { status: "expired" };
  }

  pruneExpired(now);
  if (!payload) return { status: "missing" };
  return { status: "ok", payload };
}
