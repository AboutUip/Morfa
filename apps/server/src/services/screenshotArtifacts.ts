import { randomUUID } from "node:crypto";

const SCREENSHOT_ARTIFACT_TTL_MS = 5 * 60 * 1000;
const MAX_SCREENSHOT_ARTIFACTS = 120;
const MAX_SCREENSHOT_ARTIFACT_BYTES = 32 * 1024 * 1024;

export interface ScreenshotArtifactInput {
  userId: string;
  projectId: string;
  mode: string;
  pageId?: string;
  scale: number;
  data: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface ScreenshotArtifact {
  token: string;
  userId: string;
  projectId: string;
  mode: string;
  pageId?: string;
  scale: number;
  data: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
  expiresAt: number;
}

export type ScreenshotArtifactLookup =
  | { status: "ok"; artifact: ScreenshotArtifact }
  | { status: "expired" }
  | { status: "missing" };

const artifacts = new Map<string, ScreenshotArtifact>();
let totalBytes = 0;

function estimateBase64Bytes(data: string) {
  return Math.ceil((data.length * 3) / 4);
}

function pruneExpired(now: number) {
  for (const [token, artifact] of artifacts) {
    if (artifact.expiresAt <= now) {
      artifacts.delete(token);
      totalBytes -= artifact.bytes;
    }
  }
}

export function createScreenshotArtifact(input: ScreenshotArtifactInput) {
  const now = Date.now();
  pruneExpired(now);

  let token = randomUUID();
  while (artifacts.has(token)) token = randomUUID();

  const bytes = estimateBase64Bytes(input.data);
  const artifact: ScreenshotArtifact = {
    ...input,
    token,
    bytes,
    createdAt: now,
    expiresAt: now + SCREENSHOT_ARTIFACT_TTL_MS,
  };
  artifacts.set(token, artifact);
  totalBytes += bytes;

  while (
    artifacts.size > MAX_SCREENSHOT_ARTIFACTS ||
    totalBytes > MAX_SCREENSHOT_ARTIFACT_BYTES
  ) {
    const oldest = artifacts.keys().next();
    if (oldest.done) break;
    const removed = artifacts.get(oldest.value);
    artifacts.delete(oldest.value);
    if (removed) totalBytes -= removed.bytes;
  }

  return {
    token,
    expiresAt: artifact.expiresAt,
    ttlMs: SCREENSHOT_ARTIFACT_TTL_MS,
  };
}

export function getScreenshotArtifact(token: string): ScreenshotArtifactLookup {
  const now = Date.now();
  const artifact = artifacts.get(token);

  if (artifact && artifact.expiresAt <= now) {
    artifacts.delete(token);
    totalBytes -= artifact.bytes;
    pruneExpired(now);
    return { status: "expired" };
  }

  pruneExpired(now);
  if (!artifact) return { status: "missing" };
  return { status: "ok", artifact };
}

export function resetScreenshotArtifactsForTests() {
  artifacts.clear();
  totalBytes = 0;
}

export const SCREENSHOT_ARTIFACT_TTL = SCREENSHOT_ARTIFACT_TTL_MS;
