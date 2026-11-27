import assert from "node:assert/strict";
import test from "node:test";

import {
  createScreenshotArtifact,
  getScreenshotArtifact,
  resetScreenshotArtifactsForTests,
} from "../apps/server/src/services/screenshotArtifacts";
import {
  buildScreenshotCacheKey,
  getScreenshotCache,
  getScreenshotCacheStats,
  resetScreenshotCacheForTests,
  setScreenshotCache,
} from "../apps/server/src/services/screenshotCache";
import {
  SCREENSHOT_RATE_LIMIT,
  assertScreenshotRateLimit,
  getScreenshotRateLimitStatus,
  resetScreenshotRateLimitForTests,
} from "../apps/server/src/services/screenshotRateLimit";

const data = Buffer.from("fake png data").toString("base64");

test("stores and resolves short-lived screenshot artifacts", () => {
  resetScreenshotArtifactsForTests();
  const created = createScreenshotArtifact({
    userId: "user",
    projectId: "project",
    mode: "page",
    pageId: "page",
    scale: 1,
    data,
    mimeType: "image/png",
    width: 100,
    height: 200,
  });

  assert.match(
    created.token,
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  );
  assert.ok(created.expiresAt > Date.now());

  const lookup = getScreenshotArtifact(created.token);
  assert.equal(lookup.status, "ok");
  if (lookup.status !== "ok") return;
  assert.equal(lookup.artifact.projectId, "project");
  assert.equal(lookup.artifact.mimeType, "image/png");
  assert.equal(lookup.artifact.data, data);

  assert.equal(getScreenshotArtifact("missing").status, "missing");
  resetScreenshotArtifactsForTests();
});

test("caches screenshots by project revision and scale", () => {
  resetScreenshotCacheForTests();
  const input = {
    userId: "user",
    projectId: "project",
    mode: "page",
    pageId: "page",
    scale: 1,
    updatedAt: 10,
  };

  assert.equal(getScreenshotCache(input), null);
  setScreenshotCache(input, { data, width: 100, height: 200 });
  const hit = getScreenshotCache(input);
  assert.equal(hit?.data, data);
  assert.equal(hit?.width, 100);

  assert.notEqual(
    buildScreenshotCacheKey(input),
    buildScreenshotCacheKey({ ...input, scale: 2 }),
  );
  assert.notEqual(
    buildScreenshotCacheKey(input),
    buildScreenshotCacheKey({ ...input, updatedAt: 11 }),
  );
  assert.equal(getScreenshotCache({ ...input, updatedAt: 11 }), null);
  assert.equal(getScreenshotCacheStats().entries, 1);
  resetScreenshotCacheForTests();
});

test("limits screenshot requests per actor window", () => {
  resetScreenshotRateLimitForTests();
  for (let index = 0; index < SCREENSHOT_RATE_LIMIT; index += 1) {
    assertScreenshotRateLimit("actor");
  }
  assert.throws(
    () => assertScreenshotRateLimit("actor"),
    (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          (error as { code?: string }).code ===
            "SCREENSHOT_RATE_LIMITED",
      ),
  );
  assert.equal(
    getScreenshotRateLimitStatus("actor").remaining,
    0,
  );
  resetScreenshotRateLimitForTests();
  assert.equal(
    getScreenshotRateLimitStatus("actor").remaining,
    SCREENSHOT_RATE_LIMIT,
  );
});
