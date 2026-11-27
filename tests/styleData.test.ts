import assert from "node:assert/strict";
import test from "node:test";

import {
  overlayRuntimePageData,
  resolveStyleVariables,
  type CanvasPage,
} from "../apps/web/src/features/projects/canvasDocument";
import {
  createRuntimeSnapshot,
  createRuntimeState,
  dispatchRuntimeEvent,
} from "../apps/web/src/features/projects/canvasRuntime";

function screen(id: string, fill: string): CanvasPage {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    styles: {
      width: "390px",
      height: "844px",
      "background-color": "${self.bg}",
      color: "${self.ink}",
    },
    data: [
      { key: "bg", type: "color", value: fill },
      { key: "ink", type: "color", value: "#1c1915" },
    ],
  };
}

test("runtime data overrides values that styles reference", () => {
  const pages = [screen("cover", "#f4efe6")];
  const stored = resolveStyleVariables(
    pages[0].styles,
    pages[0],
    pages,
    [],
  );
  assert.equal(stored["background-color"], "#f4efe6");

  const overlaid = overlayRuntimePageData(pages, {
    cover: { bg: "#161411", ink: "#f3ecdf" },
  });
  const resolved = resolveStyleVariables(
    pages[0].styles,
    overlaid[0],
    overlaid,
    [],
  );
  assert.equal(resolved["background-color"], "#161411");
  assert.equal(resolved.color, "#f3ecdf");
  assert.equal(pages[0].data?.[0]?.value, "#f4efe6");
});

test("setData updates a style variable on the targeted node", () => {
  const button: CanvasPage = {
    id: "tone",
    name: "tone",
    parentId: "cover",
    x: 0,
    y: 0,
    styles: { width: "80px", height: "36px" },
    widget: { kind: "button", text: "深色" },
  };
  const cover = screen("cover", "#f4efe6");
  const behavior = {
    version: 2 as const,
    triggers: [],
    states: [{ id: "default", name: "Default", initial: true }],
    blocks: [
      {
        id: "event",
        type: "event" as const,
        x: 0,
        y: 0,
        event: "click",
        nodeId: "tone",
      },
      {
        id: "paint",
        type: "action" as const,
        x: 200,
        y: 0,
        action: {
          id: "paint-action",
          type: "setData" as const,
          targetId: "cover",
          key: "bg",
          value: "#161411",
        },
      },
    ],
    edges: [{ id: "edge", from: "event", to: "paint" }],
  };
  const snapshot = createRuntimeSnapshot(
    [cover, button],
    [],
    "project",
    "cover",
    behavior,
  );
  const next = dispatchRuntimeEvent(
    snapshot,
    createRuntimeState(snapshot),
    "tone",
    "click",
  );
  const pages = overlayRuntimePageData(
    snapshot.pages,
    next.runtimeNodeData,
  );
  const resolved = resolveStyleVariables(
    cover.styles,
    pages[0],
    pages,
    [],
  );
  assert.equal(resolved["background-color"], "#161411");
});
