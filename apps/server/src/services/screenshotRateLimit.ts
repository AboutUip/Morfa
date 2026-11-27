import { ApiError } from "../lib/errors.js";

const SCREENSHOT_RATE_WINDOW_MS = 60 * 1000;
export const SCREENSHOT_RATE_LIMIT = 30;

interface Bucket {
  windowStartedAt: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

function pruneBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStartedAt >= SCREENSHOT_RATE_WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

/**
 * Fixed-window limiter for screenshot rendering. Authentication is already
 * resolved by the MCP layer; actorId is normally the API key id.
 */
export function assertScreenshotRateLimit(actorId: string) {
  const now = Date.now();
  pruneBuckets(now);

  const current = buckets.get(actorId);
  if (!current || now - current.windowStartedAt >= SCREENSHOT_RATE_WINDOW_MS) {
    buckets.set(actorId, { windowStartedAt: now, count: 1 });
    return;
  }

  if (current.count >= SCREENSHOT_RATE_LIMIT) {
    const retryAfterMs = Math.max(
      1,
      SCREENSHOT_RATE_WINDOW_MS - (now - current.windowStartedAt),
    );
    throw new ApiError(
      429,
      "SCREENSHOT_RATE_LIMITED",
      `截图请求过于频繁，请在 ${Math.ceil(retryAfterMs / 1000)} 秒后重试`,
    );
  }

  current.count += 1;
}

export function getScreenshotRateLimitStatus(actorId: string) {
  const now = Date.now();
  const bucket = buckets.get(actorId);
  if (!bucket || now - bucket.windowStartedAt >= SCREENSHOT_RATE_WINDOW_MS) {
    return {
      limit: SCREENSHOT_RATE_LIMIT,
      remaining: SCREENSHOT_RATE_LIMIT,
      resetAt: now + SCREENSHOT_RATE_WINDOW_MS,
    };
  }
  return {
    limit: SCREENSHOT_RATE_LIMIT,
    remaining: Math.max(0, SCREENSHOT_RATE_LIMIT - bucket.count),
    resetAt: bucket.windowStartedAt + SCREENSHOT_RATE_WINDOW_MS,
  };
}

export function resetScreenshotRateLimitForTests() {
  buckets.clear();
}
