import { RealtimeGateway } from "./gateway.js";
import { registerRealtimeOperations } from "./operations/index.js";

export const realtimeGateway = new RealtimeGateway();

export function initializeRealtimeOperations() {
  registerRealtimeOperations();
}
