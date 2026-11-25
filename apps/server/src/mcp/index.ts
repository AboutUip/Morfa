import { McpController } from "./controller.js";
import { registerMcpCapabilities } from "./capabilities/index.js";

export function createMcpController(): McpController {
  const controller = new McpController();
  registerMcpCapabilities(controller);
  return controller;
}

export { McpController } from "./controller.js";
export type {
  McpCapability,
  McpCapabilityDetail,
  McpCapabilitySummary,
  McpCategory,
  McpContext,
  McpKeyPermissions,
  McpSearchOptions,
} from "./types.js";
