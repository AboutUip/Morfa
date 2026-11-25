import { registerMcpRealtimeOperations } from "./mcp.js";
import { registerPreferencesRealtimeOperations } from "./preferences.js";

export function registerRealtimeOperations() {
  registerPreferencesRealtimeOperations();
  registerMcpRealtimeOperations();
}
