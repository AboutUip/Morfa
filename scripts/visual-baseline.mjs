import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import zlib from "node:zlib";

const ORIGIN = process.env.MORFA_API_ORIGIN ?? "http://127.0.0.1:3001";
const DATABASE_PATH =
  process.env.DATABASE_PATH ??
  path.resolve("apps/server/data/morfa.sqlite");
const BASELINE_PATH = path.resolve("tests/visual-baseline.json");
const BASELINE_PNG_PATH = path.resolve("tests/visual-baseline.png");
const ARTIFACT_DIR = path.resolve("dev/visual-artifacts");
const CHANNEL_THRESHOLD = Number(
  process.env.MORFA_VISUAL_CHANNEL_THRESHOLD ?? 32,
);
const MAX_CHANGED_RATIO = Number(
  process.env.MORFA_VISUAL_MAX_CHANGED_RATIO ?? 0.01,
);
const UPDATE = process.argv.includes("--update");

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

/**
 * Decode an 8-bit non-interlaced PNG into raw pixels. Chrome is free to pick
 * different PNG compression/metadata between runs; comparing raw pixels avoids
 * false positives while still catching real visual changes.
 */
function decodePngPixels(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Screenshot is not a PNG");
  }
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (!header) throw new Error("PNG header missing");
  if (header.bitDepth !== 8 || header.interlace !== 0) {
    throw new Error(
      `Unsupported PNG format: depth=${header.bitDepth}, interlace=${header.interlace}`,
    );
  }
  const channels =
    header.colorType === 6
      ? 4
      : header.colorType === 2
        ? 3
        : header.colorType === 4
          ? 2
          : header.colorType === 0
            ? 1
            : 0;
  if (!channels) {
    throw new Error(`Unsupported PNG color type ${header.colorType}`);
  }
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const rowBytes = header.width * channels;
  const stride = rowBytes + 1;
  if (inflated.length < stride * header.height) {
    throw new Error("PNG pixel data is truncated");
  }
  const pixels = Buffer.alloc(rowBytes * header.height);
  let previous = Buffer.alloc(rowBytes);
  for (let row = 0; row < header.height; row += 1) {
    const filter = inflated[row * stride];
    const input = inflated.subarray(
      row * stride + 1,
      row * stride + stride,
    );
    const output = pixels.subarray(
      row * rowBytes,
      (row + 1) * rowBytes,
    );
    for (let index = 0; index < rowBytes; index += 1) {
      const left = index >= channels ? output[index - channels] : 0;
      const up = previous[index];
      const upperLeft =
        index >= channels ? previous[index - channels] : 0;
      let value = input[index];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paeth(left, up, upperLeft);
      else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
      output[index] = value & 0xff;
    }
    previous = output;
  }
  return {
    width: header.width,
    height: header.height,
    channels,
    pixels,
  };
}

function comparePixels(expected, actual) {
  if (
    expected.width !== actual.width ||
    expected.height !== actual.height ||
    expected.channels !== actual.channels
  ) {
    return {
      dimensionMismatch: true,
      changedRatio: 1,
      comparedPixels: 0,
      changedPixels: 0,
    };
  }
  let changedPixels = 0;
  const pixels = expected.width * expected.height;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * expected.channels;
    let changed = false;
    for (let channel = 0; channel < expected.channels; channel += 1) {
      if (
        Math.abs(
          expected.pixels[offset + channel] -
            actual.pixels[offset + channel],
        ) > CHANNEL_THRESHOLD
      ) {
        changed = true;
        break;
      }
    }
    if (changed) changedPixels += 1;
  }
  return {
    dimensionMismatch: false,
    changedRatio: changedPixels / pixels,
    comparedPixels: pixels,
    changedPixels,
  };
}

function fail(message) {
  console.error(`visual-baseline: ${message}`);
  process.exitCode = 1;
}

async function waitForApi() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${ORIGIN}/api/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Morfa API is not reachable at ${ORIGIN}. Start npm run dev first.`,
  );
}

async function main() {
  await waitForApi();
  if (!fs.existsSync(DATABASE_PATH)) {
    throw new Error(`Database not found at ${DATABASE_PATH}`);
  }
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const db = new DatabaseSync(DATABASE_PATH);
  const user = db
    .prepare(
      "SELECT id FROM users WHERE status = 'active' ORDER BY created_at ASC LIMIT 1",
    )
    .get();
  if (!user?.id) {
    db.close();
    throw new Error("No active user is available for the visual baseline.");
  }

  const token = `mf_visual_${randomBytes(18).toString("hex")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const keyId = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO api_keys
      (id, user_id, name, token_hash, token_prefix, allow_vcode,
       allow_password, last_used_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, NULL, ?, ?)`,
  ).run(
    keyId,
    user.id,
    "Temporary Visual Baseline",
    tokenHash,
    token.slice(0, 11),
    now,
    now,
  );
  db.close();

  let rpcId = 0;
  async function rpc(method, params) {
    const response = await fetch(`${ORIGIN}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method,
        ...(params ? { params } : {}),
      }),
    });
    const body = await response.json();
    if (body.error) throw new Error(JSON.stringify(body.error));
    return body.result;
  }
  async function call(name, args) {
    const result = await rpc("tools/call", { name, arguments: args });
    if (result.isError) {
      throw new Error(`${name}: ${result.content?.[0]?.text}`);
    }
    return result;
  }

  let projectId = null;
  try {
    await rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "morfa-visual-baseline", version: "1" },
    });

    const projectResult = await call("create_project", {
      name: `Visual Baseline ${now.toString(36)}`,
      description: "Temporary deterministic visual regression fixture",
      type: "software",
      visibility: "private",
    });
    projectId =
      projectResult.structuredContent.project?.id ??
      projectResult.structuredContent.id;

    await call("create_page", {
      projectId,
      id: "visual-page",
      name: "Visual Baseline",
      x: 0,
      y: 0,
      styles: JSON.stringify({
        width: "360px",
        height: "240px",
        "background-color": "#f5f3ff",
        "border-radius": "16px",
        "border-width": "1px",
        "border-style": "solid",
        "border-color": "#ddd6fe",
      }),
    });
    await call("create_page", {
      projectId,
      name: "Baseline title",
      parentId: "visual-page",
      x: 24,
      y: 24,
      styles: JSON.stringify({
        width: "220px",
        height: "28px",
        "background-color": "transparent",
      }),
      widget: JSON.stringify({
        kind: "text",
        text: "Visual baseline",
        variant: "heading",
      }),
    });
    await call("create_page", {
      projectId,
      name: "Baseline copy",
      parentId: "visual-page",
      x: 24,
      y: 60,
      styles: JSON.stringify({
        width: "300px",
        height: "22px",
        "background-color": "transparent",
      }),
      widget: JSON.stringify({
        kind: "text",
        text: "Deterministic renderer fixture",
        variant: "muted",
      }),
    });
    await call("create_page", {
      projectId,
      name: "Baseline action",
      parentId: "visual-page",
      x: 24,
      y: 104,
      styles: JSON.stringify({
        width: "152px",
        height: "44px",
        "background-color": "transparent",
      }),
      widget: JSON.stringify({
        kind: "button",
        text: "Confirm",
        variant: "primary",
      }),
    });
    await call("create_page", {
      projectId,
      name: "Baseline badge",
      parentId: "visual-page",
      x: 196,
      y: 110,
      styles: JSON.stringify({
        width: "96px",
        height: "28px",
        "background-color": "transparent",
      }),
      widget: JSON.stringify({
        kind: "badge",
        text: "Stable",
        variant: "success",
      }),
    });

    const capture = await call("capture_page", {
      projectId,
      pageId: "visual-page",
      scale: 1,
    });
    const image = capture.content.find((item) => item.type === "image");
    if (!image?.data) {
      throw new Error("capture_page did not return image content");
    }
    const buffer = Buffer.from(image.data, "base64");
    const digest = createHash("sha256").update(buffer).digest("hex");
    const decoded = decodePngPixels(buffer);
    const pixelDigest = createHash("sha256")
      .update(decoded.pixels)
      .digest("hex");
    const artifactPath = path.join(ARTIFACT_DIR, "visual-page.png");
    fs.writeFileSync(artifactPath, buffer);

    const actual = {
      version: 1,
      pageId: "visual-page",
      scale: 1,
      width: capture.structuredContent.width,
      height: capture.structuredContent.height,
      bytes: buffer.byteLength,
      sha256: digest,
      pixelSha256: pixelDigest,
    };

    if (UPDATE) {
      fs.writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify(actual, null, 2)}\n`,
        "utf8",
      );
      fs.writeFileSync(BASELINE_PNG_PATH, buffer);
      console.log(`visual-baseline: updated ${BASELINE_PATH}`);
      console.log(`  ${actual.width}x${actual.height}, ${actual.bytes} bytes`);
      console.log(`  pixel sha256 ${actual.pixelSha256}`);
      return;
    }

    if (!fs.existsSync(BASELINE_PATH)) {
      throw new Error(
        `Baseline missing at ${BASELINE_PATH}. Run npm run test:visual:update.`,
      );
    }
    const expected = JSON.parse(
      fs.readFileSync(BASELINE_PATH, "utf8"),
    );
    if (
      expected.width !== actual.width ||
      expected.height !== actual.height
    ) {
      throw new Error(
        `Screenshot size changed: expected ${expected.width}x${expected.height}, got ${actual.width}x${actual.height}`,
      );
    }
    if (!fs.existsSync(BASELINE_PNG_PATH)) {
      throw new Error(
        `Baseline PNG missing at ${BASELINE_PNG_PATH}. Run npm run test:visual:update.`,
      );
    }
    const baselinePng = decodePngPixels(
      fs.readFileSync(BASELINE_PNG_PATH),
    );
    const comparison = comparePixels(baselinePng, decoded);
    if (
      comparison.dimensionMismatch ||
      comparison.changedRatio > MAX_CHANGED_RATIO
    ) {
      throw new Error(
        `Visual baseline mismatch: ${comparison.changedPixels}/${comparison.comparedPixels} pixels changed (${(comparison.changedRatio * 100).toFixed(3)}%, allowed ${(MAX_CHANGED_RATIO * 100).toFixed(3)}%). Artifact: ${artifactPath}`,
      );
    }
    console.log("visual-baseline: pass");
    console.log(`  ${actual.width}x${actual.height}, ${actual.bytes} bytes`);
    console.log(
      `  changed ${comparison.changedPixels}/${comparison.comparedPixels} pixels (${(comparison.changedRatio * 100).toFixed(3)}%)`,
    );
    console.log(`  pixel sha256 ${actual.pixelSha256}`);
  } finally {
    if (projectId) {
      await call("delete_project", { projectId }).catch(() => null);
    }
    const cleanupDb = new DatabaseSync(DATABASE_PATH);
    cleanupDb.prepare("DELETE FROM api_keys WHERE id = ?").run(keyId);
    cleanupDb.close();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
