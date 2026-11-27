const SCREENSHOT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_SCREENSHOT_CACHE_ENTRIES = 80;
const MAX_SCREENSHOT_CACHE_BYTES = 32 * 1024 * 1024;

export interface ScreenshotCacheInput {
  userId: string;
  projectId: string;
  mode: string;
  pageId?: string;
  scale: number;
  updatedAt: number;
}

export interface ScreenshotCacheEntry {
  data: string;
  width: number;
  height: number;
  pageName?: string;
  nodeName?: string;
  pageCount?: number;
  nodeCount?: number;
  bounds?: unknown;
  createdAt: number;
  bytes: number;
}

interface StoredScreenshotCacheEntry extends ScreenshotCacheEntry {
  key: string;
  expiresAt: number;
}

const entries = new Map<string, StoredScreenshotCacheEntry>();
let totalBytes = 0;

function estimateBase64Bytes(data: string) {
  return Math.ceil((data.length * 3) / 4);
}

function pruneExpired(now: number) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) {
      entries.delete(key);
      totalBytes -= entry.bytes;
    }
  }
}

export function buildScreenshotCacheKey(input: ScreenshotCacheInput) {
  return [
    input.userId,
    input.projectId,
    input.mode,
    input.pageId ?? "canvas",
    input.scale,
    input.updatedAt,
  ].join("|");
}

export function getScreenshotCache(input: ScreenshotCacheInput) {
  const now = Date.now();
  pruneExpired(now);
  const key = buildScreenshotCacheKey(input);
  const entry = entries.get(key);
  if (!entry) return null;

  // Refresh insertion order so hot screenshots survive eviction.
  entries.delete(key);
  entries.set(key, entry);
  return entry;
}

export function setScreenshotCache(
  input: ScreenshotCacheInput,
  entry: Omit<ScreenshotCacheEntry, "createdAt" | "bytes">,
) {
  const key = buildScreenshotCacheKey(input);
  const existing = entries.get(key);
  if (existing) {
    entries.delete(key);
    totalBytes -= existing.bytes;
  }

  const now = Date.now();
  const bytes = estimateBase64Bytes(entry.data);
  const stored: StoredScreenshotCacheEntry = {
    ...entry,
    key,
    bytes,
    createdAt: now,
    expiresAt: now + SCREENSHOT_CACHE_TTL_MS,
  };
  entries.set(key, stored);
  totalBytes += bytes;

  while (
    entries.size > MAX_SCREENSHOT_CACHE_ENTRIES ||
    totalBytes > MAX_SCREENSHOT_CACHE_BYTES
  ) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    const oldestEntry = entries.get(oldest.value);
    entries.delete(oldest.value);
    if (oldestEntry) totalBytes -= oldestEntry.bytes;
  }
}

export function getScreenshotCacheStats() {
  pruneExpired(Date.now());
  return {
    entries: entries.size,
    bytes: totalBytes,
    ttlMs: SCREENSHOT_CACHE_TTL_MS,
  };
}

export function resetScreenshotCacheForTests() {
  entries.clear();
  totalBytes = 0;
}
