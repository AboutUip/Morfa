import { ApiError } from "../../lib/errors.js";
import {
  createModelProvider,
  listModelProviders,
  removeModelProvider,
  revealModelProviderKey,
  syncModelProvider,
  updateModelCapabilities,
} from "../../services/modelProviders.js";
import {
  prepareModelTest,
  streamModelTest,
} from "../../services/modelTest.js";
import { verifyVCodeForUser } from "../../services/vcode.js";
import {
  DESTRUCTIVE_ANNOTATIONS,
  READ_ONLY_ANNOTATIONS,
  REQUIRE_NONE,
  WRITE_ANNOTATIONS,
  type McpCapability,
} from "../types.js";

const PROVIDER_ID_SCHEMA = {
  type: "string" as const,
  description: "Model provider id.",
  minLength: 1,
  maxLength: 64,
};

export function modelCapabilities(): McpCapability[] {
  return [
    {
      name: "list_model_providers",
      title: {
        "zh-CN": "列出模型供应商",
        "en-US": "List model providers",
      },
      description: {
        "zh-CN":
          "列出当前账号配置的模型供应商、模型列表与模型能力，不返回供应商 API Key。",
        "en-US":
          "List configured model providers, their models, and model capabilities without returning provider API keys.",
      },
      usage: { "zh-CN": "无需参数。", "en-US": "Takes no arguments." },
      returns: {
        "zh-CN": "供应商列表与数量。",
        "en-US": "A list of providers and the total count.",
      },
      category: "models",
      requirements: REQUIRE_NONE,
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      examples: [{ arguments: {} }],
      async execute(context) {
        const providers = listModelProviders(context.user.id);
        return { count: providers.length, providers };
      },
    },
    {
      name: "add_model_provider",
      title: {
        "zh-CN": "添加模型供应商",
        "en-US": "Add model provider",
      },
      description: {
        "zh-CN":
          "添加 OpenAI 或 Anthropic 兼容的模型供应商，并在服务端拉取模型列表。",
        "en-US":
          "Add an OpenAI- or Anthropic-compatible model provider and fetch its model list server-side.",
      },
      usage: {
        "zh-CN":
          "需要 protocol、baseUrl 与供应商 apiKey。name 可省略。服务端会限制 HTTP/HTTPS 并设置 15 秒超时。",
        "en-US":
          "Requires protocol, baseUrl, and the provider apiKey. name is optional. The server allows HTTP/HTTPS and applies a 15-second timeout.",
      },
      returns: {
        "zh-CN": "创建后的供应商与已拉取模型。",
        "en-US": "The created provider and fetched models.",
      },
      category: "models",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          protocol: {
            type: "string",
            description: "Provider protocol.",
            enum: ["openai", "anthropic"],
          },
          name: {
            type: "string",
            description: "Display name; optional.",
            maxLength: 60,
          },
          baseUrl: {
            type: "string",
            description: "Provider API base URL.",
            minLength: 1,
            maxLength: 2048,
          },
          apiKey: {
            type: "string",
            description: "Provider API key.",
            minLength: 1,
            maxLength: 4096,
          },
        },
        required: ["protocol", "baseUrl", "apiKey"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            protocol: "openai",
            name: "OpenAI",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-...",
          },
        },
      ],
      async execute(context, args) {
        const provider = await createModelProvider(context.user, {
          name: typeof args.name === "string" ? args.name : "",
          protocol: args.protocol as string,
          baseUrl: args.baseUrl as string,
          apiKey: args.apiKey as string,
        });
        return { provider };
      },
    },
    {
      name: "refresh_model_provider",
      title: {
        "zh-CN": "刷新供应商模型",
        "en-US": "Refresh provider models",
      },
      description: {
        "zh-CN":
          "使用已保存的供应商 API Key 重新拉取模型列表，并保留手动的能力配置。",
        "en-US":
          "Fetch the provider's model list again with the stored API key, preserving manual capability settings.",
      },
      usage: {
        "zh-CN": "传入 providerId。",
        "en-US": "Pass providerId.",
      },
      returns: {
        "zh-CN": "更新后的供应商。",
        "en-US": "The updated provider.",
      },
      category: "models",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          providerId: PROVIDER_ID_SCHEMA,
        },
        required: ["providerId"],
        additionalProperties: false,
      },
      examples: [{ arguments: { providerId: "provider-uuid" } }],
      async execute(context, args) {
        const provider = await syncModelProvider(
          context.user,
          args.providerId as string,
        );
        return { provider };
      },
    },
    {
      name: "update_model_capabilities",
      title: {
        "zh-CN": "更新模型能力",
        "en-US": "Update model capabilities",
      },
      description: {
        "zh-CN":
          "设置某个模型的流式、思考与多模态能力。",
        "en-US":
          "Set streaming, thinking, and multimodal capabilities for a model.",
      },
      usage: {
        "zh-CN":
          "传入 providerId、modelId 与三个布尔值，三项都必须显式提供。",
        "en-US":
          "Pass providerId, modelId, and all three boolean capability values.",
      },
      returns: {
        "zh-CN": "更新后的供应商。",
        "en-US": "The updated provider.",
      },
      category: "models",
      requirements: REQUIRE_NONE,
      annotations: { ...WRITE_ANNOTATIONS, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          providerId: PROVIDER_ID_SCHEMA,
          modelId: {
            type: "string",
            description: "Model id.",
            minLength: 1,
            maxLength: 300,
          },
          supportsStreaming: {
            type: "boolean",
            description: "Supports streamed output.",
          },
          supportsThinking: {
            type: "boolean",
            description: "Supports reasoning / thinking.",
          },
          supportsMultimodal: {
            type: "boolean",
            description: "Supports images or other non-text input.",
          },
        },
        required: [
          "providerId",
          "modelId",
          "supportsStreaming",
          "supportsThinking",
          "supportsMultimodal",
        ],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            providerId: "provider-uuid",
            modelId: "gpt-4o",
            supportsStreaming: true,
            supportsThinking: false,
            supportsMultimodal: true,
          },
        },
      ],
      async execute(context, args) {
        const provider = updateModelCapabilities(
          context.user,
          args.providerId as string,
          args.modelId as string,
          {
            supportsStreaming: args.supportsStreaming === true,
            supportsThinking: args.supportsThinking === true,
            supportsMultimodal: args.supportsMultimodal === true,
          },
        );
        return { provider };
      },
    },
    {
      name: "test_model",
      title: {
        "zh-CN": "测试模型",
        "en-US": "Test model",
      },
      description: {
        "zh-CN":
          "真实调用一个已配置模型并要求返回内容，用于验证供应商与模型是否可用。会消耗少量 token。",
        "en-US":
          "Make a real call to a configured model and require a response to verify availability. This consumes a small number of tokens.",
      },
      usage: {
        "zh-CN":
          "传入 providerId、modelId；thinking 可选。模型支持流式时会使用流式协议，单次最长 60 秒。",
        "en-US":
          "Pass providerId and modelId; thinking is optional. Streaming is used when supported, with a 60-second limit.",
      },
      returns: {
        "zh-CN": "模型返回文本、思考过程、耗时与是否使用流式。",
        "en-US":
          "The model response text, reasoning, duration, and whether streaming was used.",
      },
      category: "models",
      requirements: REQUIRE_NONE,
      annotations: WRITE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          providerId: PROVIDER_ID_SCHEMA,
          modelId: {
            type: "string",
            description: "Model id.",
            minLength: 1,
            maxLength: 300,
          },
          thinking: {
            type: "boolean",
            description: "Enable thinking for this test.",
          },
        },
        required: ["providerId", "modelId"],
        additionalProperties: false,
      },
      examples: [
        {
          arguments: {
            providerId: "provider-uuid",
            modelId: "gpt-4o",
            thinking: false,
          },
        },
      ],
      async execute(context, args) {
        const thinking = args.thinking === true;
        const test = prepareModelTest(
          context.user,
          args.providerId as string,
          args.modelId as string,
          thinking,
        );

        const abort = new AbortController();
        let text = "";
        let reasoning = "";
        let durationMs = 0;

        for await (const event of streamModelTest(test, abort.signal)) {
          if (event.type === "delta") {
            text += event.text;
          } else if (event.type === "reasoning") {
            reasoning += event.text;
          } else if (event.type === "done") {
            durationMs = event.durationMs;
          } else if (event.type === "error") {
            throw new ApiError(400, event.code, event.message);
          }
        }

        return {
          providerId: args.providerId as string,
          modelId: test.model.model_id,
          thinking,
          streaming: test.model.supports_streaming,
          text,
          reasoning,
          durationMs,
        };
      },
    },
    {
      name: "reveal_model_provider_key",
      title: {
        "zh-CN": "查看供应商 API Key",
        "en-US": "Reveal provider API key",
      },
      description: {
        "zh-CN":
          "校验 VCode 后返回某个模型供应商的明文 API Key。",
        "en-US":
          "Verify a VCode and return the plaintext API key for a model provider.",
      },
      usage: {
        "zh-CN":
          "传入 providerId 与当前账号 6 位 vcode。API Key 必须开启 VCode 权限。",
        "en-US":
          "Pass providerId and the account's 6-digit vcode. The API key must enable VCode permission.",
      },
      returns: {
        "zh-CN": "供应商 ID 与明文 API Key。",
        "en-US": "The provider id and plaintext API key.",
      },
      category: "models",
      requirements: { vcode: true, password: false },
      annotations: READ_ONLY_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          providerId: PROVIDER_ID_SCHEMA,
          vcode: {
            type: "string",
            description: "Current account 6-digit VCode.",
            minLength: 6,
            maxLength: 6,
          },
        },
        required: ["providerId", "vcode"],
        additionalProperties: false,
      },
      examples: [
        { arguments: { providerId: "provider-uuid", vcode: "123456" } },
      ],
      async execute(context, args) {
        const { ticket } = await verifyVCodeForUser(
          context.user,
          args.vcode as string,
          "reveal_api_key",
        );
        const apiKey = revealModelProviderKey(
          context.user,
          args.providerId as string,
          ticket,
        );
        return {
          providerId: args.providerId as string,
          apiKey,
        };
      },
    },
    {
      name: "delete_model_provider",
      title: {
        "zh-CN": "删除模型供应商",
        "en-US": "Delete model provider",
      },
      description: {
        "zh-CN":
          "删除模型供应商及其模型列表。此操作不可撤销。",
        "en-US":
          "Delete a model provider and its model list. This cannot be undone.",
      },
      usage: {
        "zh-CN": "传入 providerId。",
        "en-US": "Pass providerId.",
      },
      returns: {
        "zh-CN": "删除结果。",
        "en-US": "The deletion result.",
      },
      category: "models",
      requirements: REQUIRE_NONE,
      annotations: DESTRUCTIVE_ANNOTATIONS,
      inputSchema: {
        type: "object",
        properties: {
          providerId: PROVIDER_ID_SCHEMA,
        },
        required: ["providerId"],
        additionalProperties: false,
      },
      examples: [{ arguments: { providerId: "provider-uuid" } }],
      async execute(context, args) {
        removeModelProvider(context.user, args.providerId as string);
        return {
          deleted: true,
          providerId: args.providerId as string,
        };
      },
    },
  ];
}
