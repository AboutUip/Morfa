import assert from "node:assert/strict";
import test from "node:test";

import { collectBehaviorLint } from "../apps/web/src/features/projects/canvasBehavior";
import type { CanvasPage } from "../apps/web/src/features/projects/canvasDocument";

test("flags unreachable behavior states and missing condition references", () => {
  const page: CanvasPage = {
    id: "owner",
    name: "Owner",
    x: 0,
    y: 0,
    styles: { width: "100px", height: "100px" },
    widget: { kind: "button", text: "Go" },
    behavior: {
      triggers: [
        {
          id: "t1",
          event: "click",
          conditions: [
            {
              id: "c1",
              source: "nodeData",
              targetId: "owner",
              key: "missing",
              operator: "eq",
              value: "true",
            },
          ],
          actions: [{ id: "a1", type: "setState", value: "active" }],
        },
      ],
      states: [
        { id: "default", name: "Default", initial: true },
        { id: "active", name: "Active" },
        { id: "orphan", name: "Orphan" },
      ],
    },
  };

  const issues = collectBehaviorLint([page]);
  assert.ok(
    issues.some(
      (issue) =>
        issue.messageKey ===
        "projects.workspace.behavior.lint.stateUnreachable",
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.messageKey ===
        "projects.workspace.behavior.lint.dataMissing",
    ),
  );
});
