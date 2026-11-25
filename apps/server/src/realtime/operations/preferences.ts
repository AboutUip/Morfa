import { ApiError } from "../../lib/errors.js";
import {
  getUserPreferences,
  updateUserPreferences,
} from "../../services/preferences.js";
import { realtimeOperations } from "../registry.js";

function readPayload(
  payload: unknown,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiError(
      400,
      "REALTIME_INVALID_PAYLOAD",
      "偏好请求参数不正确",
    );
  }
  return payload as Record<string, unknown>;
}

export function registerPreferencesRealtimeOperations() {
  realtimeOperations.register("preferences", "get", (context) => {
    return getUserPreferences(context.user.id);
  });

  realtimeOperations.register("preferences", "update", (context, payload) => {
    const input = readPayload(payload);
    return updateUserPreferences(context.user.id, {
      locale: input.locale,
      themeMode: input.themeMode,
    });
  });
}
