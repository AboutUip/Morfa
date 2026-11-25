export interface LocalizedText {
  "zh-CN": string;
  "en-US": string;
}

export interface BuiltInSignalDefinition {
  key: string;
  title: LocalizedText;
  description: LocalizedText;
  category: "preferences" | "models" | "mcp" | "realtime" | "account";
  payloadExample: Record<string, unknown>;
  realtimeModule: string;
  realtimeEvent: string;
}

export const BUILT_IN_SIGNALS: readonly BuiltInSignalDefinition[] = [
  {
    key: "preferences.changed",
    title: {
      "zh-CN": "偏好设置变化",
      "en-US": "Preferences changed",
    },
    description: {
      "zh-CN": "语言或主题偏好被修改。",
      "en-US": "Language or theme preferences changed.",
    },
    category: "preferences",
    payloadExample: { locale: "zh-CN", themeMode: "dark" },
    realtimeModule: "preferences",
    realtimeEvent: "changed",
  },
  {
    key: "model.provider.created",
    title: {
      "zh-CN": "模型供应商已添加",
      "en-US": "Model provider created",
    },
    description: {
      "zh-CN": "添加了一个 OpenAI 或 Anthropic 兼容供应商。",
      "en-US": "An OpenAI- or Anthropic-compatible provider was added.",
    },
    category: "models",
    payloadExample: { providerId: "uuid", name: "OpenAI" },
    realtimeModule: "model",
    realtimeEvent: "provider.created",
  },
  {
    key: "model.provider.synced",
    title: {
      "zh-CN": "模型列表已刷新",
      "en-US": "Model provider synced",
    },
    description: {
      "zh-CN": "供应商模型列表被重新拉取。",
      "en-US": "A provider's model list was refreshed.",
    },
    category: "models",
    payloadExample: { providerId: "uuid", modelCount: 3 },
    realtimeModule: "model",
    realtimeEvent: "provider.synced",
  },
  {
    key: "model.provider.updated",
    title: {
      "zh-CN": "模型能力已更新",
      "en-US": "Model capabilities updated",
    },
    description: {
      "zh-CN": "某个模型的流式、思考或多模态能力被修改。",
      "en-US":
        "Streaming, thinking, or multimodal capability settings changed.",
    },
    category: "models",
    payloadExample: { providerId: "uuid", modelId: "gpt-4o" },
    realtimeModule: "model",
    realtimeEvent: "provider.updated",
  },
  {
    key: "model.provider.deleted",
    title: {
      "zh-CN": "模型供应商已删除",
      "en-US": "Model provider deleted",
    },
    description: {
      "zh-CN": "一个模型供应商及其模型被删除。",
      "en-US": "A model provider and its models were deleted.",
    },
    category: "models",
    payloadExample: { providerId: "uuid" },
    realtimeModule: "model",
    realtimeEvent: "provider.deleted",
  },
  {
    key: "mcp.api_key.created",
    title: {
      "zh-CN": "MCP API Key 已创建",
      "en-US": "MCP API key created",
    },
    description: {
      "zh-CN": "创建了一个新的 MCP API Key。",
      "en-US": "A new MCP API key was created.",
    },
    category: "mcp",
    payloadExample: {
      id: "uuid",
      name: "Cursor",
      allowVCode: true,
      allowPassword: false,
    },
    realtimeModule: "mcp",
    realtimeEvent: "api_key.created",
  },
  {
    key: "mcp.api_key.revoked",
    title: {
      "zh-CN": "MCP API Key 已删除",
      "en-US": "MCP API key revoked",
    },
    description: {
      "zh-CN": "一个 MCP API Key 被删除。",
      "en-US": "An MCP API key was revoked.",
    },
    category: "mcp",
    payloadExample: { id: "uuid", name: "Cursor" },
    realtimeModule: "mcp",
    realtimeEvent: "api_key.revoked",
  },
  {
    key: "realtime.connected",
    title: {
      "zh-CN": "实时通道已连接",
      "en-US": "Realtime connected",
    },
    description: {
      "zh-CN": "一个新的 WebSocket 连接建立。",
      "en-US": "A new WebSocket connection was established.",
    },
    category: "realtime",
    payloadExample: { connectionId: "uuid" },
    realtimeModule: "realtime",
    realtimeEvent: "connected",
  },
  {
    key: "realtime.disconnected",
    title: {
      "zh-CN": "实时通道已断开",
      "en-US": "Realtime disconnected",
    },
    description: {
      "zh-CN": "一个 WebSocket 连接关闭。",
      "en-US": "A WebSocket connection closed.",
    },
    category: "realtime",
    payloadExample: { connectionId: "uuid" },
    realtimeModule: "realtime",
    realtimeEvent: "disconnected",
  },
  {
    key: "export.created",
    title: {
      "zh-CN": "导出包已生成",
      "en-US": "Export created",
    },
    description: {
      "zh-CN": "生成了新的加密导出包。",
      "en-US": "A new encrypted export package was created.",
    },
    category: "account",
    payloadExample: { fileSize: 1024, createdAt: 0 },
    realtimeModule: "export",
    realtimeEvent: "created",
  },
] as const;

export const BUILT_IN_SIGNAL_MAP = new Map(
  BUILT_IN_SIGNALS.map((signal) => [signal.key, signal]),
);

export const REALTIME_SIGNAL_MAP = new Map(
  BUILT_IN_SIGNALS.map((signal) => [
    `${signal.realtimeModule}.${signal.realtimeEvent}`,
    signal.key,
  ]),
);

export function isBuiltInSignal(signalKey: string): boolean {
  return BUILT_IN_SIGNAL_MAP.has(signalKey);
}
