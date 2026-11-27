import assert from "node:assert/strict";
import test from "node:test";

import {
  convertStoredWorldPositions,
  resolveCanvasAspectRatio,
  resolveCanvasLayout,
  resolveCanvasLength,
} from "../packages/shared/src/canvasLayout";

test("resolves px, %, calc, min, max and clamp lengths", () => {
  assert.equal(resolveCanvasLength("120px", 500).value, 120);
  assert.equal(resolveCanvasLength("50%", 500).value, 250);
  assert.equal(resolveCanvasLength("calc(100% - 2 * 10px)", 500).value, 480);
  assert.equal(resolveCanvasLength("clamp(100px, 50%, 300px)", 1000).value, 300);
  assert.equal(resolveCanvasLength("min(30%, 100px)", 1000).value, 100);
  assert.equal(resolveCanvasLength("50%", undefined).value, null);
  assert.equal(resolveCanvasLength("calc(10px +)", 500).value, null);
});

test("resolves parent-relative sizing, anchoring and constraints", () => {
  const frames = resolveCanvasLayout([
    {
      id: "root",
      x: 0,
      y: 0,
      styles: { width: "1000px", height: "800px" },
    },
    {
      id: "half",
      x: 0,
      y: 0,
      parentId: "root",
      styles: {
        width: "50%",
        height: "25%",
        left: "10%",
        top: "20px",
      },
    },
    {
      id: "anchored",
      x: 0,
      y: 0,
      parentId: "root",
      styles: {
        width: "200px",
        height: "100px",
        right: "20px",
        bottom: "calc(50% - 10px)",
      },
    },
    {
      id: "stretch",
      x: 0,
      y: 0,
      parentId: "root",
      styles: {
        width: "auto",
        height: "50px",
        left: "20px",
        right: "calc(10px + 5%)",
      },
    },
    {
      id: "clamped",
      x: 0,
      y: 0,
      parentId: "root",
      styles: {
        width: "50%",
        height: "50%",
        "max-width": "320px",
        "min-height": "calc(100% - 10px)",
      },
    },
  ]);

  assert.deepEqual(
    { x: frames.get("half")?.worldX, y: frames.get("half")?.worldY },
    { x: 100, y: 20 },
  );
  assert.equal(frames.get("half")?.width, 500);
  assert.equal(frames.get("half")?.height, 200);
  assert.equal(frames.get("anchored")?.worldX, 780);
  assert.equal(frames.get("anchored")?.worldY, 310);
  assert.equal(frames.get("stretch")?.width, 920);
  assert.equal(frames.get("clamped")?.width, 320);
  assert.equal(frames.get("clamped")?.height, 790);
  assert.ok([...frames.values()].every((frame) => frame.valid));
});

test("nested percentages follow a resized parent", () => {
  const pages = [
    {
      id: "root",
      x: 0,
      y: 0,
      styles: { width: "1200px", height: "800px" },
    },
    {
      id: "child",
      x: 0,
      y: 0,
      parentId: "root",
      styles: { width: "50%", height: "25%" },
    },
  ];
  const first = resolveCanvasLayout(pages);
  assert.equal(first.get("child")?.width, 600);
  assert.equal(first.get("child")?.height, 200);

  pages[0].styles.width = "800px";
  const second = resolveCanvasLayout(pages);
  assert.equal(second.get("child")?.width, 400);
});

test("resolves aspect-ratio when one dimension is auto", () => {
  assert.equal(resolveCanvasAspectRatio("16 / 9"), 16 / 9);
  assert.equal(resolveCanvasAspectRatio("4/3"), 4 / 3);
  assert.equal(resolveCanvasAspectRatio("1.5"), 1.5);
  assert.equal(resolveCanvasAspectRatio("auto"), null);
  assert.equal(resolveCanvasAspectRatio("0 / 9"), null);
  assert.equal(resolveCanvasAspectRatio("16foo"), null);

  const frames = resolveCanvasLayout([
    {
      id: "root",
      x: 0,
      y: 0,
      styles: { width: "1000px", height: "800px" },
    },
    {
      id: "from-width",
      x: 0,
      y: 0,
      parentId: "root",
      styles: {
        width: "320px",
        height: "auto",
        "aspect-ratio": "16 / 9",
      },
    },
    {
      id: "from-height",
      x: 0,
      y: 0,
      parentId: "root",
      styles: {
        width: "auto",
        height: "180px",
        "aspect-ratio": "4 / 3",
      },
    },
    {
      id: "stretched-width",
      x: 0,
      y: 0,
      parentId: "root",
      styles: {
        left: "20px",
        right: "20px",
        height: "auto",
        "aspect-ratio": "2",
      },
    },
    {
      id: "overridden",
      x: 0,
      y: 0,
      parentId: "root",
      styles: {
        width: "300px",
        height: "100px",
        "aspect-ratio": "16 / 9",
      },
    },
    {
      id: "invalid",
      x: 0,
      y: 0,
      parentId: "root",
      styles: {
        width: "100px",
        height: "auto",
        "aspect-ratio": "banana",
      },
    },
  ]);

  assert.equal(frames.get("from-width")?.height, 180);
  assert.equal(frames.get("from-height")?.width, 240);
  assert.equal(frames.get("stretched-width")?.width, 960);
  assert.equal(frames.get("stretched-width")?.height, 480);
  assert.equal(frames.get("overridden")?.height, 100);
  assert.equal(frames.get("invalid")?.valid, false);
  assert.equal(
    frames.get("invalid")?.issues[0]?.code,
    "invalid-aspect-ratio",
  );
});

test("child coordinates are offsets from the parent", () => {
  const frames = resolveCanvasLayout([
    {
      id: "root",
      x: 100,
      y: 40,
      styles: { width: "400px", height: "300px" },
    },
    {
      id: "child",
      x: 80,
      y: 60,
      parentId: "root",
      styles: { width: "100px", height: "50px" },
    },
    {
      id: "grand",
      x: 10,
      y: 12,
      parentId: "child",
      styles: { width: "20px", height: "20px" },
    },
  ]);
  assert.equal(frames.get("child")?.localX, 80);
  assert.equal(frames.get("child")?.localY, 60);
  assert.equal(frames.get("child")?.worldX, 180);
  assert.equal(frames.get("child")?.worldY, 100);
  assert.equal(frames.get("grand")?.worldX, 190);
  assert.equal(frames.get("grand")?.worldY, 112);
});

test("stored world coordinates convert to parent offsets once", () => {
  const nodes = [
    { id: "root", x: 100, y: 40 },
    { id: "child", x: 180, y: 120, parentId: "root" },
    { id: "grand", x: 190, y: 132, parentId: "child" },
  ];
  convertStoredWorldPositions(nodes);
  assert.equal(nodes[1].x, 80);
  assert.equal(nodes[1].y, 80);
  assert.equal(nodes[2].x, 10);
  assert.equal(nodes[2].y, 12);

  const frames = resolveCanvasLayout(
    nodes.map((node) => ({
      ...node,
      styles: { width: "40px", height: "40px" },
    })),
  );
  assert.equal(frames.get("child")?.worldX, 180);
  assert.equal(frames.get("grand")?.worldX, 190);
});

test("missing parents and cycles are reported as invalid, not crashes", () => {
  const missing = resolveCanvasLayout([
    {
      id: "orphan",
      x: 10,
      y: 10,
      parentId: "missing",
      styles: { width: "100px", height: "100px" },
    },
  ]);
  assert.equal(missing.get("orphan")?.valid, false);
  assert.equal(
    missing.get("orphan")?.issues[0]?.code,
    "parent-missing",
  );

  const cycle = resolveCanvasLayout([
    {
      id: "a",
      x: 0,
      y: 0,
      parentId: "b",
      styles: { width: "100px", height: "100px" },
    },
    {
      id: "b",
      x: 10,
      y: 10,
      parentId: "a",
      styles: { width: "100px", height: "100px" },
    },
  ]);
  assert.ok(cycle.has("a"));
  assert.ok(cycle.has("b"));
});
