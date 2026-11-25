import {
  mcpApi,
  preferencesApi,
  type McpCapabilityDetail,
  type McpCapabilitySummary,
  type UserPreferences,
} from "../api";
import { realtimeClient } from "./client";

export const preferencesRealtime = {
  async get(): Promise<UserPreferences> {
    if (realtimeClient.isOpen()) {
      try {
        return await realtimeClient.request<UserPreferences>(
          "preferences",
          "get",
        );
      } catch {
        // 回退到一次性 HTTP 请求
      }
    }

    const { preferences } = await preferencesApi.get();
    return preferences;
  },

  async update(input: {
    locale?: "zh-CN" | "en-US";
    themeMode?: "system" | "light" | "dark";
  }): Promise<UserPreferences> {
    if (realtimeClient.isOpen()) {
      try {
        return await realtimeClient.request<UserPreferences>(
          "preferences",
          "update",
          input,
        );
      } catch {
        // 回退到一次性 HTTP 请求
      }
    }

    const { preferences } = await preferencesApi.update(input);
    return preferences;
  },

  subscribe(
    handler: (preferences: UserPreferences) => void,
  ): () => void {
    return realtimeClient.subscribe(
      "preferences",
      "changed",
      (payload) => {
        if (payload && typeof payload === "object") {
          handler(payload as UserPreferences);
        }
      },
    );
  },
};

export const mcpRealtime = {
  async capabilities(): Promise<{
    count: number;
    capabilities: McpCapabilitySummary[];
  }> {
    if (realtimeClient.isOpen()) {
      try {
        return await realtimeClient.request<{
          count: number;
          capabilities: McpCapabilitySummary[];
        }>("mcp", "capabilities.list");
      } catch {
        // 回退到 HTTP
      }
    }
    return mcpApi.capabilities();
  },

  async capability(name: string): Promise<{
    capability: McpCapabilityDetail;
  }> {
    if (realtimeClient.isOpen()) {
      try {
        return await realtimeClient.request<{
          capability: McpCapabilityDetail;
        }>("mcp", "capabilities.get", { name });
      } catch {
        // 回退到 HTTP
      }
    }
    return mcpApi.capability(name);
  },
};

export { realtimeClient } from "./client";
