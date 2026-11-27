import assert from "node:assert/strict";
import test from "node:test";

import { getWidgetStyleFields } from "../apps/web/src/features/projects/widgetStyleSchema";

test("exposes component-specific style fields for every widget family", () => {
  for (const kind of [
    "button",
    "select",
    "input",
    "search",
    "textarea",
    "checkbox",
    "radio",
    "toggle",
    "progress",
    "slider",
    "image",
    "video",
    "avatar",
    "badge",
    "card",
    "tabs",
    "alert",
    "divider",
    "chart",
  ] as const) {
    assert.ok(
      getWidgetStyleFields(kind).length > 0,
      `${kind} should expose component-specific styles`,
    );
  }

  assert.ok(
    getWidgetStyleFields("button").some(
      (field) => field.key === "--mf-widget-button-padding",
    ),
  );
  assert.ok(
    getWidgetStyleFields("input").some(
      (field) => field.key === "--mf-widget-field-placeholder",
    ),
  );
  assert.ok(
    getWidgetStyleFields("card").some(
      (field) => field.key === "--mf-widget-card-title",
    ),
  );
  assert.equal(getWidgetStyleFields(undefined).length, 0);
});
