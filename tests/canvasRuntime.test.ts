import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeSnapshot,
  createRuntimeState,
  dispatchRuntimeEvent,
} from "../apps/web/src/features/projects/canvasRuntime";
import type { CanvasPage } from "../apps/web/src/features/projects/canvasDocument";

function page(
  id: string,
  behavior?: CanvasPage["behavior"],
  widget?: CanvasPage["widget"],
): CanvasPage {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    styles: { width: "100px", height: "100px" },
    ...(behavior ? { behavior } : {}),
    ...(widget ? { widget } : {}),
  };
}

function snapshot(pages: CanvasPage[]) {
  return createRuntimeSnapshot(pages, [], "owner", "owner");
}

test("runs variable, state and visibility conditions", () => {
  const owner = page(
    "owner",
    {
      triggers: [
        {
          id: "all",
          event: "click",
          conditionMode: "all",
          conditions: [
            {
              id: "c1",
              source: "variable",
              key: "count",
              operator: "gte",
              value: "2",
            },
            {
              id: "c2",
              source: "nodeVisible",
              targetId: "next",
              operator: "eq",
              value: "true",
            },
          ],
          actions: [{ id: "a1", type: "navigate", pageId: "next" }],
        },
      ],
      states: [{ id: "default", name: "Default", initial: true }],
      variables: [{ key: "count", type: "number", initialValue: "0" }],
    },
    { kind: "button", text: "Go" },
  );
  const next = page("next", undefined, { kind: "text", text: "Next" });
  const runtimeSnapshot = snapshot([owner, next]);
  let state = createRuntimeState(runtimeSnapshot);

  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(state.currentPageId, "owner");

  state = { ...state, variables: { ...state.variables, count: "2" } };
  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(state.currentPageId, "next");
  assert.deepEqual(state.navigationStack, ["owner"]);
});

test("supports any mode and negated conditions", () => {
  const owner = page(
    "owner",
    {
      triggers: [
        {
          id: "any",
          event: "click",
          conditionMode: "any",
          conditions: [
            {
              id: "c1",
              source: "variable",
              key: "blocked",
              operator: "eq",
              value: "true",
              negate: true,
            },
            {
              id: "c2",
              source: "state",
              operator: "eq",
              value: "default",
            },
          ],
          actions: [
            { id: "a1", type: "setText", targetId: "target", value: "ok" },
          ],
        },
      ],
      states: [{ id: "default", name: "Default", initial: true }],
      variables: [{ key: "blocked", type: "boolean", initialValue: "false" }],
    },
    { kind: "button", text: "Go" },
  );
  const target = page("target", undefined, { kind: "text", text: "before" });
  const runtimeSnapshot = snapshot([owner, target]);
  let state = createRuntimeState(runtimeSnapshot);

  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(state.overrides.target?.text, "ok");

  state = {
    ...state,
    variables: { ...state.variables, blocked: "true" },
    states: { ...state.states, owner: "other" },
  };
  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(state.overrides.target?.text, "ok");
});

test("evaluates node style conditions against design and runtime styles", () => {
  const owner = page(
    "owner",
    {
      triggers: [
        {
          id: "style-check",
          event: "click",
          conditions: [
            {
              id: "c1",
              source: "nodeStyle",
              targetId: "target",
              key: "background-color",
              operator: "eq",
              value: "#ffffff",
            },
          ],
          actions: [
            { id: "a1", type: "setText", targetId: "target", value: "matched" },
          ],
        },
      ],
      states: [{ id: "default", name: "Default", initial: true }],
      variables: [],
    },
    { kind: "button", text: "Go" },
  );
  const target = page("target", undefined, { kind: "text", text: "before" });
  target.styles["background-color"] = "#ffffff";
  const runtimeSnapshot = snapshot([owner, target]);
  let state = createRuntimeState(runtimeSnapshot);

  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(state.overrides.target?.text, "matched");

  state = {
    ...state,
    overrides: {
      ...state.overrides,
      target: {
        styles: { "background-color": "#000000" },
        text: "stale",
      },
    },
  };
  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(state.overrides.target?.text, "stale");
});

test("state-scoped triggers only fire in their state and style overrides stay runtime-only", () => {
  const owner = page(
    "owner",
    {
      triggers: [
        {
          id: "t1",
          event: "click",
          stateId: "active",
          actions: [
            {
              id: "a1",
              type: "setStyle",
              targetId: "target",
              key: "background-color",
              value: "#ff0000",
            },
          ],
        },
      ],
      states: [
        { id: "default", name: "Default", initial: true },
        { id: "active", name: "Active" },
      ],
      variables: [],
    },
    { kind: "button", text: "Go" },
  );
  const target = page("target", undefined, { kind: "button", text: "Target" });
  const runtimeSnapshot = snapshot([owner, target]);
  let state = createRuntimeState(runtimeSnapshot);

  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(state.overrides.target, undefined);

  state = { ...state, states: { ...state.states, owner: "active" } };
  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(
    state.overrides.target?.styles["background-color"],
    "#ff0000",
  );
  assert.equal(target.styles["background-color"], undefined);
});
