import assert from "node:assert/strict";
import test from "node:test";

import { buildNodePages, readNodeSpecs } from "../apps/server/src/mcp/capabilities/design";
import { validateArguments } from "../apps/server/src/mcp/schema";
import type { McpInputSchema } from "../apps/server/src/mcp/types";

test("creates a parent before its text child and keeps the copy", () => {
  const specs = readNodeSpecs([
    {
      ref: "screen",
      name: "宣传页",
      width: 390,
      height: 844,
      fill: "#f6f1e7",
    },
    {
      ref: "title",
      name: "标题",
      parentRef: "screen",
      kind: "text",
      variant: "heading",
      text: "墨线马克笔",
      x: 28,
      y: 96,
      width: 330,
      height: 88,
      fontSize: 42,
      fontWeight: 700,
      color: "#1c1915",
      textAlign: "left",
    },
  ]);
  let next = 0;
  const planned = buildNodePages(new Set(), specs, (used) => {
    next += 1;
    const id = `n${next}`;
    used.add(id);
    return id;
  });

  assert.equal(planned[1].parentId, planned[0].id);
  assert.equal(planned[0].page.styles.width, "390px");
  assert.equal(planned[0].page.styles["background-color"], "#f6f1e7");
  assert.equal(planned[1].page.widget?.kind, "text");
  assert.equal(planned[1].page.widget?.text, "墨线马克笔");
  assert.equal(planned[1].page.styles["font-size"], "42px");
  assert.equal(planned[1].page.styles.color, "#1c1915");
  assert.equal(planned[1].page.x, 28);
});

test("stores data, image source, and overflow on the node", () => {
  const specs = readNodeSpecs([
    {
      ref: "screen",
      name: "封面",
      width: 390,
      height: 844,
      fill: "${self.bg}",
      data: [{ key: "bg", type: "color", value: "#f4efe6" }],
    },
    {
      ref: "poster",
      name: "海报",
      parentRef: "screen",
      kind: "image",
      src: "http://127.0.0.1:3001/assets/poster.png",
      overflowY: "auto",
      width: 390,
      height: 2200,
    },
  ]);
  const planned = buildNodePages(new Set(), specs, (used) => {
    const id = "n1";
    used.add(id);
    return id;
  });
  assert.equal(planned[0].page.styles["background-color"], "${self.bg}");
  assert.equal(planned[0].page.data?.[0]?.value, "#f4efe6");
  assert.equal(
    planned[1].page.widget?.src,
    "http://127.0.0.1:3001/assets/poster.png",
  );
  assert.equal(planned[1].page.styles["overflow-y"], "auto");
});

test("accepts a node array in the tool schema", () => {
  const schema: McpInputSchema = {
    type: "object",
    properties: {
      nodes: {
        type: "array",
        description: "Nodes.",
        minItems: 1,
        maxItems: 2,
        items: {
          type: "object",
          properties: {
            ref: { type: "string", description: "Ref.", minLength: 1 },
            name: { type: "string", description: "Name.", minLength: 1 },
          },
          required: ["ref", "name"],
        },
      },
    },
    required: ["nodes"],
  };

  assert.deepEqual(
    validateArguments(schema, {
      nodes: [{ ref: "screen", name: "宣传页" }],
    }),
    { nodes: [{ ref: "screen", name: "宣传页" }] },
  );
});
