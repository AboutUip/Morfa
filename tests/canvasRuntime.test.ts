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

test("runs node data, state and visibility conditions", () => {
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
              source: "nodeData",
              targetId: "owner",
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
    },
    { kind: "button", text: "Go" },
  );
  owner.data = [{ key: "count", type: "number", value: "0" }];
  const next = page("next", undefined, { kind: "text", text: "Next" });
  const runtimeSnapshot = snapshot([owner, next]);
  let state = createRuntimeState(runtimeSnapshot);

  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(state.currentPageId, "owner");

  state = {
    ...state,
    runtimeNodeData: { owner: { count: "2" } },
  };
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
              source: "nodeData",
              targetId: "owner",
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
    },
    { kind: "button", text: "Go" },
  );
  owner.data = [{ key: "blocked", type: "boolean", value: "false" }];
  const target = page("target", undefined, { kind: "text", text: "before" });
  const runtimeSnapshot = snapshot([owner, target]);
  let state = createRuntimeState(runtimeSnapshot);

  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(state.overrides.target?.text, "ok");

  state = {
    ...state,
    runtimeNodeData: { owner: { blocked: "true" } },
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

test("executes v2 block graphs, data writes, and state edges", () => {
  const owner = page(
    "owner",
    {
      version: 2,
      triggers: [],
      states: [
        { id: "idle", name: "Idle", initial: true },
        { id: "active", name: "Active" },
      ],
      blocks: [
        {
          id: "e1",
          type: "event",
          x: 0,
          y: 0,
          event: "click",
        },
        {
          id: "c1",
          type: "condition",
          x: 100,
          y: 0,
          condition: {
            id: "c1",
            source: "nodeData",
            targetId: "owner",
            key: "count",
            operator: "gte",
            value: "2",
          },
        },
        {
          id: "a1",
          type: "action",
          x: 200,
          y: 0,
          action: {
            id: "a1",
            type: "setData",
            targetId: "owner",
            key: "count",
            value: "0",
          },
        },
      ],
      edges: [
        { id: "edge1", from: "e1", to: "c1" },
        { id: "edge2", from: "c1", to: "a1" },
        { id: "edge3", from: "a1", to: "active" },
      ],
    },
    { kind: "button", text: "Go" },
  );
  owner.data = [{ key: "count", type: "number", value: "2" }];
  const runtimeSnapshot = snapshot([owner]);
  let state = createRuntimeState(runtimeSnapshot);
  state = dispatchRuntimeEvent(
    runtimeSnapshot,
    state,
    "owner",
    "click",
  );
  assert.equal(state.runtimeNodeData.owner?.count, "0");
  assert.equal(state.states.owner, "active");

  state = {
    ...state,
    runtimeNodeData: { owner: { count: "1" } },
    states: { ...state.states, owner: "idle" },
  };
  state = dispatchRuntimeEvent(
    runtimeSnapshot,
    state,
    "owner",
    "click",
  );
  assert.equal(state.runtimeNodeData.owner?.count, "1");
  assert.equal(state.states.owner, "idle");
});

test("keeps control instance child overrides isolated by instance scope", () => {
  const control: CanvasPage = {
    id: "control",
    name: "Control",
    x: 0,
    y: 0,
    styles: {},
    nodeKind: "control",
    control: { status: "compiled", defaultStateId: "state" },
  };
  const state: CanvasPage = {
    id: "state",
    name: "State",
    x: 0,
    y: 0,
    styles: { width: "100px", height: "100px" },
    nodeKind: "control-state",
    controlId: "control",
  };
  const child = page(
    "child",
    {
      triggers: [
        {
          id: "t1",
          event: "click",
          actions: [
            {
              id: "a1",
              type: "setText",
              targetId: "child",
              value: "clicked",
            },
          ],
        },
      ],
      states: [{ id: "default", name: "Default", initial: true }],
    },
    { kind: "button", text: "Child" },
  );
  child.parentId = "state";
  const instance = (id: string): CanvasPage => ({
    id,
    name: id,
    x: 0,
    y: 0,
    styles: { width: "100px", height: "100px" },
    nodeKind: "control-instance",
    controlId: "control",
    controlStateId: "state",
  });
  const runtimeSnapshot = snapshot([
    control,
    state,
    child,
    instance("one"),
    instance("two"),
  ]);
  let runtime = createRuntimeState(runtimeSnapshot);
  runtime = dispatchRuntimeEvent(
    runtimeSnapshot,
    runtime,
    "child",
    "click",
    "one",
  );
  assert.equal(runtime.overrides["one::child"]?.text, "clicked");
  assert.equal(runtime.overrides["two::child"], undefined);

  runtime = dispatchRuntimeEvent(
    runtimeSnapshot,
    runtime,
    "child",
    "click",
    "two",
  );
  assert.equal(runtime.overrides["two::child"]?.text, "clicked");
  assert.equal(runtime.overrides.child, undefined);
});

test("switches control instance state through a behavior action", () => {
  const owner = page(
    "owner",
    {
      triggers: [
        {
          id: "t1",
          event: "click",
          actions: [
            {
              id: "a1",
              type: "setControlState",
              targetId: "instance",
              value: "expanded",
            },
          ],
        },
      ],
      states: [{ id: "default", name: "Default", initial: true }],
    },
    { kind: "button", text: "More" },
  );
  const instance: CanvasPage = {
    id: "instance",
    name: "More",
    x: 0,
    y: 0,
    styles: { width: "48px", height: "48px" },
    nodeKind: "control-instance",
    controlId: "control",
    controlStateId: "collapsed",
  };
  const control: CanvasPage = {
    id: "control",
    name: "More",
    x: 0,
    y: 0,
    styles: { width: "48px", height: "48px" },
    nodeKind: "control",
    control: { status: "compiled", defaultStateId: "collapsed" },
  };
  const collapsed: CanvasPage = {
    id: "collapsed",
    name: "Collapsed",
    x: 0,
    y: 0,
    styles: { width: "48px", height: "48px" },
    nodeKind: "control-state",
    controlId: "control",
  };
  const expanded: CanvasPage = {
    id: "expanded",
    name: "Expanded",
    x: 0,
    y: 0,
    styles: { width: "220px", height: "180px" },
    nodeKind: "control-state",
    controlId: "control",
  };
  const runtimeSnapshot = snapshot([owner, instance, control, collapsed, expanded]);
  let state = createRuntimeState(runtimeSnapshot);
  state = dispatchRuntimeEvent(runtimeSnapshot, state, "owner", "click");
  assert.equal(state.controlStates.instance, "expanded");
});

test("keeps nested control instances isolated by ancestor scope", () => {
  const outerControl: CanvasPage = {
    id: "outer-control",
    name: "Outer",
    x: 0,
    y: 0,
    styles: {},
    nodeKind: "control",
    control: { status: "compiled", defaultStateId: "outer-state" },
  };
  const outerState: CanvasPage = {
    ...page("outer-state"),
    nodeKind: "control-state",
    controlId: "outer-control",
  };
  const innerControl: CanvasPage = {
    id: "inner-control",
    name: "Inner",
    x: 0,
    y: 0,
    styles: {},
    nodeKind: "control",
    control: { status: "compiled", defaultStateId: "inner-a" },
  };
  const innerA: CanvasPage = {
    ...page("inner-a"),
    nodeKind: "control-state",
    controlId: "inner-control",
  };
  const innerB: CanvasPage = {
    ...page("inner-b"),
    nodeKind: "control-state",
    controlId: "inner-control",
  };
  const innerChild = page(
    "inner-child",
    {
      triggers: [
        {
          id: "t1",
          event: "click",
          actions: [
            {
              id: "a1",
              type: "setText",
              targetId: "inner-child",
              value: "yes",
            },
          ],
        },
      ],
      states: [{ id: "default", name: "Default", initial: true }],
    },
    { kind: "button", text: "Inner" },
  );
  innerChild.parentId = "inner-a";
  const innerInstance: CanvasPage = {
    id: "inner-instance",
    name: "Inner",
    x: 0,
    y: 0,
    styles: { width: "100px", height: "100px" },
    parentId: "outer-state",
    nodeKind: "control-instance",
    controlId: "inner-control",
    controlStateId: "inner-a",
    behavior: {
      triggers: [
        {
          id: "switch",
          event: "click",
          actions: [
            {
              id: "to-b",
              type: "setControlState",
              targetId: "inner-instance",
              value: "inner-b",
            },
          ],
        },
      ],
      states: [{ id: "default", name: "Default", initial: true }],
    },
  };
  const outerInstance = (id: string): CanvasPage => ({
    id,
    name: id,
    x: 0,
    y: 0,
    styles: { width: "100px", height: "100px" },
    nodeKind: "control-instance",
    controlId: "outer-control",
    controlStateId: "outer-state",
  });

  const runtimeSnapshot = snapshot([
    outerControl,
    outerState,
    innerControl,
    innerA,
    innerB,
    innerChild,
    innerInstance,
    outerInstance("outer-a"),
    outerInstance("outer-b"),
  ]);
  let runtime = createRuntimeState(runtimeSnapshot);

  runtime = dispatchRuntimeEvent(
    runtimeSnapshot,
    runtime,
    "inner-child",
    "click",
    "outer-a::inner-instance",
  );
  runtime = dispatchRuntimeEvent(
    runtimeSnapshot,
    runtime,
    "inner-child",
    "click",
    "outer-b::inner-instance",
  );
  assert.equal(
    runtime.overrides["outer-a::inner-instance::inner-child"]?.text,
    "yes",
  );
  assert.equal(
    runtime.overrides["outer-b::inner-instance::inner-child"]?.text,
    "yes",
  );

  runtime = dispatchRuntimeEvent(
    runtimeSnapshot,
    runtime,
    "inner-instance",
    "click",
    "outer-a::inner-instance",
  );
  assert.equal(
    runtime.controlStates["outer-a::inner-instance"],
    "inner-b",
  );
  assert.equal(
    runtime.overrides["outer-a::inner-instance::inner-child"],
    undefined,
  );
  assert.equal(
    runtime.overrides["outer-b::inner-instance::inner-child"]?.text,
    "yes",
  );
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
