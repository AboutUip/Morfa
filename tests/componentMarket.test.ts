import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPONENT_MARKET,
  getMarketItem,
} from "../apps/web/src/features/projects/componentMarket";

test("exposes a control container in the market containers category", () => {
  const item = getMarketItem("container-control");
  assert.ok(item);
  assert.equal(item?.type, "container");
  assert.equal(item?.type === "container" ? item.control : undefined, true);
  assert.equal(item?.width, 240);
  assert.equal(item?.height, 120);

  const blank = COMPONENT_MARKET.find(
    (entry) => entry.id === "container-blank",
  );
  assert.ok(blank);
  assert.equal(
    blank?.type === "container" ? blank.control : undefined,
    undefined,
  );
});
