import assert from "node:assert/strict";
import test from "node:test";

import {
  collectBehaviorLint,
  materializeBehaviorGraph,
} from "../apps/web/src/features/projects/canvasBehavior";
import type {
  CanvasBehavior,
  CanvasPage,
} from "../apps/web/src/features/projects/canvasDocument";

test("materializes legacy triggers into a linear block graph", () => {
  const behavior: CanvasBehavior = {
    triggers: [
      {
        id: "t1",
        event: "click",
        stateId: "active",
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
            targetId: "owner",
            operator: "eq",
            value: "true",
          },
        ],
        actions: [
          { id: "a1", type: "incrementData", targetId: "owner", key: "count", value: "1" },
          { id: "a2", type: "setState", value: "active" },
        ],
      },
    ],
    states: [
      { id: "default", name: "Default", initial: true },
      { id: "active", name: "Active" },
    ],
  };

  const result = materializeBehaviorGraph(behavior);
  assert.equal(result.converted, true);
  assert.equal(result.changed, true);
  assert.equal(result.behavior.version, 2);
  assert.deepEqual(result.behavior.triggers, []);

  const blocks = result.behavior.blocks ?? [];
  const edges = result.behavior.edges ?? [];
  assert.equal(blocks.length, 5);
  assert.equal(edges.length, 4);

  const event = blocks.find((block) => block.type === "event");
  assert.ok(event);
  assert.equal(event.event, "click");
  assert.equal(event.stateId, "active");

  const byId = new Map(blocks.map((block) => [block.id, block]));
  const outgoing = new Map(edges.map((edge) => [edge.from, edge.to]));
  const chain: string[] = [];
  let cursor = event.id;
  while (outgoing.has(cursor)) {
    cursor = outgoing.get(cursor) as string;
    chain.push(cursor);
  }
  assert.deepEqual(
    chain.map((id) => byId.get(id)?.type),
    ["condition", "condition", "action", "action"],
  );
  assert.deepEqual(
    chain.map((id) => {
      const block = byId.get(id);
      return block?.condition?.id ?? block?.action?.id;
    }),
    ["c1", "c2", "a1", "a2"],
  );

  for (const state of result.behavior.states) {
    assert.equal(typeof state.x, "number");
    assert.equal(typeof state.y, "number");
  }
});

test("keeps existing blocks and only fills missing state positions", () => {
  const behavior: CanvasBehavior = {
    version: 2,
    triggers: [],
    states: [
      { id: "default", name: "Default", initial: true, x: 12, y: 34 },
      { id: "other", name: "Other" },
    ],
    blocks: [
      { id: "b1", type: "note", x: 5, y: 6, text: "keep" },
    ],
    edges: [],
  };

  const result = materializeBehaviorGraph(behavior);
  assert.equal(result.converted, false);
  assert.equal(result.changed, true);
  assert.equal(result.behavior.blocks?.[0].x, 5);
  assert.equal(result.behavior.states[0].x, 12);
  assert.equal(result.behavior.states[0].y, 34);
  assert.equal(typeof result.behavior.states[1].x, "number");
  assert.equal(typeof result.behavior.states[1].y, "number");

  const again = materializeBehaviorGraph(result.behavior);
  assert.equal(again.changed, false);
  assert.equal(again.behavior, result.behavior);
});

test("lints duplicate blocks, dangling edges and block-level references", () => {
  const page: CanvasPage = {
    id: "owner",
    name: "Owner",
    x: 0,
    y: 0,
    styles: { width: "100px", height: "100px" },
    widget: { kind: "button", text: "Go" },
    behavior: {
      version: 2,
      triggers: [],
      states: [
        { id: "default", name: "Default", initial: true },
        { id: "orphan", name: "Orphan" },
      ],
      blocks: [
        {
          id: "e1",
          type: "event",
          x: 0,
          y: 0,
          event: "click",
          stateId: "ghost",
        },
        {
          id: "c1",
          type: "condition",
          x: 200,
          y: 0,
          condition: {
            id: "cond1",
            source: "nodeData",
            targetId: "owner",
            key: "missing",
            operator: "eq",
            value: "1",
          },
        },
        { id: "c1", type: "note", x: 400, y: 0, text: "duplicate" },
        {
          id: "a1",
          type: "action",
          x: 600,
          y: 0,
          action: {
            id: "act1",
            type: "setControlState",
            targetId: "owner",
            value: "wide",
          },
        },
      ],
      edges: [
        { id: "ed1", from: "c1", to: "ghost" },
        { id: "ed1", from: "a1", to: "default" },
      ],
    },
  };

  const issues = collectBehaviorLint([page]);
  const has = (messageKey: string, predicate?: (issue: (typeof issues)[number]) => boolean) =>
    issues.some(
      (issue) =>
        issue.messageKey === messageKey &&
        (predicate ? predicate(issue) : true),
    );

  assert.ok(
    has(
      "projects.workspace.behavior.lint.blockDuplicate",
      (issue) => issue.blockId === "c1",
    ),
  );
  assert.ok(
    has(
      "projects.workspace.behavior.lint.edgeDuplicate",
      (issue) => issue.edgeId === "ed1",
    ),
  );
  assert.ok(
    has(
      "projects.workspace.behavior.lint.edgeDangling",
      (issue) => issue.edgeId === "ed1",
    ),
  );
  assert.ok(
    has(
      "projects.workspace.behavior.lint.stateMissing",
      (issue) => issue.blockId === "e1",
    ),
  );
  assert.ok(
    has(
      "projects.workspace.behavior.lint.blockNoOutgoing",
      (issue) => issue.blockId === "e1",
    ),
  );
  assert.ok(
    has(
      "projects.workspace.behavior.lint.dataMissing",
      (issue) => issue.blockId === "c1",
    ),
  );
  assert.ok(
    has(
      "projects.workspace.behavior.lint.controlTargetMissing",
      (issue) => issue.blockId === "a1",
    ),
  );
  assert.ok(
    has(
      "projects.workspace.behavior.lint.stateUnreachable",
      (issue) => issue.stateId === "orphan",
    ),
  );
});
