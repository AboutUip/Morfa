import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeSnapshot,
  createRuntimeState,
  dispatchRuntimeEvent,
} from "../apps/web/src/features/projects/canvasRuntime";
import type { CanvasPage } from "../apps/web/src/features/projects/canvasDocument";
import { resolveCanvasLayout } from "../packages/shared/src/canvasLayout";

function page(
  id: string,
  parentId: string | undefined,
  styles: Record<string, string>,
): CanvasPage {
  return {
    id,
    name: id,
    x: (Number.parseInt(id.replace(/\D/g, ""), 10) || 0) * 4,
    y: (Number.parseInt(id.replace(/\D/g, ""), 10) || 0) * 2,
    styles,
    ...(parentId ? { parentId } : {}),
  };
}

test("resolves a 1200-node canvas within the layout baseline", () => {
  const pages: CanvasPage[] = [
    page("root", undefined, {
      width: "2400px",
      height: "1600px",
    }),
    ...Array.from({ length: 1200 }, (_, index) =>
      page(`p${index}`, "root", {
        width: "10%",
        height: "10%",
        "background-color": "#ffffff",
      }),
    ),
  ];

  const started = performance.now();
  const frames = resolveCanvasLayout(pages);
  const elapsed = performance.now() - started;
  console.log(`layout-1200: ${elapsed.toFixed(1)}ms`);
  assert.equal(frames.size, pages.length);
  assert.ok(
    elapsed < 2000,
    `layout took ${elapsed.toFixed(1)}ms (baseline 2000ms)`,
  );
});

test("runs 500 runtime events on a 1000-node snapshot within baseline", () => {
  const trigger: CanvasPage["behavior"] = {
    triggers: [
      {
        id: "click",
        event: "click",
        actions: [
          {
            id: "a1",
            type: "setText",
            targetId: "p0",
            value: "clicked",
          },
        ],
      },
    ],
    states: [{ id: "default", name: "Default", initial: true }],
  };
  const pages: CanvasPage[] = [
    {
      ...page("p0", undefined, { width: "800px", height: "600px" }),
      behavior: trigger,
      widget: { kind: "button", text: "Run" },
    },
    ...Array.from({ length: 999 }, (_, index) =>
      page(`p${index + 1}`, "p0", {
        width: "32px",
        height: "32px",
      }),
    ),
  ];
  const snapshot = createRuntimeSnapshot(pages, [], "p0", "p0");
  let runtime = createRuntimeState(snapshot);

  const started = performance.now();
  for (let index = 0; index < 500; index += 1) {
    runtime = dispatchRuntimeEvent(
      snapshot,
      runtime,
      "p0",
      "click",
      "baseline-scope",
    );
  }
  const elapsed = performance.now() - started;
  console.log(`runtime-500x1000: ${elapsed.toFixed(1)}ms`);
  assert.equal(runtime.overrides.p0?.text, "clicked");
  assert.ok(
    elapsed < 2000,
    `runtime took ${elapsed.toFixed(1)}ms (baseline 2000ms)`,
  );
});
