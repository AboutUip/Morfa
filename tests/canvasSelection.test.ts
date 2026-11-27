import assert from "node:assert/strict";
import test from "node:test";

import { topSelectedIds } from "../apps/web/src/features/projects/canvasHierarchy";

const pages = [
  { id: "cover" },
  { id: "title", parentId: "cover" },
  { id: "card", parentId: "cover" },
  { id: "cap", parentId: "card" },
  { id: "detail" },
];

test("a multi-selection moves only the outermost selected nodes", () => {
  assert.deepEqual(
    topSelectedIds(pages, ["cover", "title", "card", "cap", "detail"]),
    ["cover", "detail"],
  );
});

test("selected siblings all move when their parent is not selected", () => {
  assert.deepEqual(topSelectedIds(pages, ["title", "card"]), [
    "title",
    "card",
  ]);
});

test("a nested node moves on its own when its ancestors are not selected", () => {
  assert.deepEqual(topSelectedIds(pages, ["cap"]), ["cap"]);
});
