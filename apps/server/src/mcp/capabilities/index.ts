import type { McpController } from "../controller.js";
import { appearanceCapabilities } from "./appearance.js";
import { behaviorCapabilities } from "./behavior.js";
import { canvasCapabilities } from "./canvas.js";
import { canvasNavigationCapabilities } from "./canvasNavigation.js";
import { dataCapabilities } from "./data.js";
import { layoutCapabilities } from "./layout.js";
import { lintCapabilities } from "./lint.js";
import { registerMetaCapabilities } from "./meta.js";
import { modelCapabilities } from "./models.js";
import { profileCapabilities } from "./profile.js";
import { projectCapabilities } from "./projects.js";
import { runtimeCapabilities } from "./runtime.js";
import { screenshotCapabilities } from "./screenshots.js";
import { securityCapabilities } from "./security.js";

export function registerMcpCapabilities(controller: McpController) {
  controller.registerAll(appearanceCapabilities());
  controller.registerAll(profileCapabilities());
  controller.registerAll(securityCapabilities());
  controller.registerAll(dataCapabilities());
  controller.registerAll(modelCapabilities());
  controller.registerAll(projectCapabilities());
  controller.registerAll(canvasCapabilities());
  controller.registerAll(canvasNavigationCapabilities());
  controller.registerAll(behaviorCapabilities());
  controller.registerAll(layoutCapabilities());
  controller.registerAll(runtimeCapabilities());
  controller.registerAll(lintCapabilities());
  controller.registerAll(screenshotCapabilities());
  registerMetaCapabilities(controller);
}
