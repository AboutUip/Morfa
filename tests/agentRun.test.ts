import assert from "node:assert/strict";
import test from "node:test";

import { mergeStreamText, withProjectId } from "../apps/server/src/services/agentRun";
import type { McpInputSchema } from "../apps/server/src/mcp/types";

const schema: McpInputSchema = {
  type: "object",
  properties: {
    projectId: { type: "string", description: "Project id." },
    name: { type: "string", description: "Name." },
  },
  required: ["projectId"],
  additionalProperties: false,
};

test("keeps streamed text when a provider repeats the whole snapshot", () => {
  assert.equal(mergeStreamText("我来做", "我来做一张宣传页"), "我来做一张宣传页");
  assert.equal(mergeStreamText("我来做一张宣传页", "宣传页"), "我来做一张宣传页");
  assert.equal(mergeStreamText("我来做", "，先看节点"), "我来做，先看节点");
});

test("fills the current project id when a tool omits it", () => {
  assert.deepEqual(withProjectId(schema, { name: "标题" }, "project-1"), {
    name: "标题",
    projectId: "project-1",
  });
  assert.deepEqual(
    withProjectId(schema, { projectId: "other", name: "标题" }, "project-1"),
    { projectId: "other", name: "标题" },
  );
});
