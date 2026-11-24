/**
 * 校验 vendored XAIOP SDK：确保 dist 已构建，并验证 Node / browser / core 入口。
 * 可独立运行，也可作为后续 CI 的冒烟步骤。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MORFA_ROOT,
  ensureXaiopBuilt,
  isXaiopBuildFresh,
} from "./vite-plugin-xaiop.mjs";

const fixtureDir = path.join(MORFA_ROOT, "vendor", "xaiop", "docs", "examples");
const wireFile = path.join(fixtureDir, "complex.xaiop");
const expectedFile = path.join(fixtureDir, "complex.expected.json");

await ensureXaiopBuilt();

assert.equal(isXaiopBuildFresh(), true, "XAIOP dist 应当是最新的");

const nodeSdk = await import("@bylan280/xaiop");
const browserSdk = await import("@bylan280/xaiop/browser");
const coreSdk = await import("@bylan280/xaiop/core");

assert.equal(nodeSdk.SDK_VERSION, "0.16.0", "SDK 版本应为 0.16.0");
assert.equal(nodeSdk.PROTOCOL_VERSION, "0.7.0", "协议版本应为 0.7.0");
assert.equal(typeof nodeSdk.XaiopWs, "function", "Node 入口应导出 XaiopWs");
assert.equal(
  typeof browserSdk.XaiopBrowserWs,
  "function",
  "浏览器入口应导出 XaiopBrowserWs",
);
assert.equal(
  typeof browserSdk.XaiopStream,
  "function",
  "浏览器入口应导出 XaiopStream",
);
assert.equal(
  typeof coreSdk.parseSync,
  "function",
  "core 入口应导出 parseSync",
);

const wire = fs.readFileSync(wireFile, "utf8");
const expected = JSON.parse(fs.readFileSync(expectedFile, "utf8"));

assert.deepEqual(nodeSdk.parseSync(wire), expected, "Node 解析结果应与夹具一致");
assert.deepEqual(
  browserSdk.parseSync(wire),
  expected,
  "浏览器入口解析结果应与夹具一致",
);
assert.deepEqual(coreSdk.parseSync(wire), expected, "core 解析结果应与夹具一致");

console.log(
  `[xaiop] 校验通过：SDK ${nodeSdk.SDK_VERSION} / 协议 ${nodeSdk.PROTOCOL_VERSION}（Node / browser / core）`,
);
