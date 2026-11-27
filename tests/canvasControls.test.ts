import assert from "node:assert/strict";
import test from "node:test";

import {
  getControlDependencyIds,
  getControlNestingBlock,
  getControlStateDeleteBlock,
} from "../apps/web/src/features/projects/canvasControls";
import {
  getControlStateSubtree,
  type CanvasPage,
} from "../apps/web/src/features/projects/canvasDocument";

const states = [{ id: "default" }, { id: "expanded" }, { id: "compact" }];

function control(id: string, status: "draft" | "compiled" = "compiled"): CanvasPage {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    styles: {},
    nodeKind: "control",
    control: { status, defaultStateId: `${id}-state` },
  };
}

function controlState(id: string, controlId: string): CanvasPage {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    styles: {},
    nodeKind: "control-state",
    controlId,
  };
}

test("detects nested control cycles and uncompiled dependencies", () => {
  const a = control("a");
  const aState = controlState("a-state", "a");
  const b = control("b");
  const bState = controlState("b-state", "b");
  const nestedB: CanvasPage = {
    id: "nested-b",
    name: "B",
    x: 0,
    y: 0,
    styles: {},
    parentId: "a-state",
    nodeKind: "control-instance",
    controlId: "b",
    controlStateId: "b-state",
  };
  const pages = [a, aState, b, bState, nestedB];

  assert.equal(getControlNestingBlock(pages, "a", "b"), null);
  assert.equal(getControlNestingBlock(pages, "b", "a"), "cycle");
  assert.equal(getControlNestingBlock(pages, "a", "a"), "cycle");
  assert.deepEqual([...getControlDependencyIds(pages, "a")], ["b"]);
  assert.deepEqual([...getControlDependencyIds(pages, "b")], []);

  const draft = control("draft", "draft");
  const draftState = controlState("draft-state", "draft");
  assert.equal(
    getControlNestingBlock([...pages, draft, draftState], "a", "draft"),
    "uncompiled",
  );
});

test("includes nested control instances in state subtrees", () => {
  const a = control("a");
  const aState = controlState("a-state", "a");
  const nested: CanvasPage = {
    id: "nested",
    name: "Nested",
    x: 10,
    y: 10,
    styles: {},
    parentId: "a-state",
    nodeKind: "control-instance",
    controlId: "b",
    controlStateId: "b-state",
  };
  const subtree = getControlStateSubtree([a, aState, nested], "a-state");
  assert.deepEqual(
    subtree.map((page) => page.id),
    ["a-state", "nested"],
  );
});

test("blocks deleting the last remaining control state", () => {
  assert.equal(
    getControlStateDeleteBlock([{ id: "default" }], "default", "default"),
    "last",
  );
  assert.equal(getControlStateDeleteBlock([], undefined, "default"), "missing");
});

test("blocks deleting the default control state", () => {
  assert.equal(
    getControlStateDeleteBlock(states, "default", "default"),
    "default",
  );
});

test("allows deleting a non-default control state", () => {
  assert.equal(
    getControlStateDeleteBlock(states, "default", "expanded"),
    null,
  );
  assert.equal(
    getControlStateDeleteBlock(states, "default", "compact"),
    null,
  );
});

test("reports a missing state", () => {
  assert.equal(
    getControlStateDeleteBlock(states, "default", "missing"),
    "missing",
  );
  assert.equal(getControlStateDeleteBlock(states, "default", null), "missing");
});
