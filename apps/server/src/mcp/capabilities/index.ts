import type { McpController } from "../controller.js";
import { appearanceCapabilities } from "./appearance.js";
import { dataCapabilities } from "./data.js";
import { registerMetaCapabilities } from "./meta.js";
import { modelCapabilities } from "./models.js";
import { profileCapabilities } from "./profile.js";
import { securityCapabilities } from "./security.js";

export function registerMcpCapabilities(controller: McpController) {
  controller.registerAll(appearanceCapabilities());
  controller.registerAll(profileCapabilities());
  controller.registerAll(securityCapabilities());
  controller.registerAll(dataCapabilities());
  controller.registerAll(modelCapabilities());
  registerMetaCapabilities(controller);
}
