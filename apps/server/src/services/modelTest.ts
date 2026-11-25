import { ApiError } from "../lib/errors.js";
import {
  findProviderWithModels,
  type ProviderModelRow,
  type ProviderProtocol,
} from "../db/modelProviders.js";
import type { UserRow } from "../db/users.js";
import { buildProviderEndpoint } from "./modelProviders.js";
import { decryptSecret } from "./secretBox.js";

const TEST_TIMEOUT_MS = 60_000;
const PROMPT =
  "This is a Morfa connectivity test. Reply with the single word: MORFA. Do not explain.";

export interface ModelTestContext {
  providerName: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  model: ProviderModelRow;
  thinking: boolean;
}

export type ModelTestEvent =
  | {
      type: "start";
      modelId: string;
      thinking: boolean;
      streaming: boolean;
    }
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "done"; durationMs: number; textLength: number }
  | { type: "error"; code: string; message: string };

export function prepareModelTest(
  user: UserRow,
  providerId: string,
  modelId: string,
  thinking: boolean,
): ModelTestContext {
  const entry = findProviderWithModels(user.id, providerId);
  if (!entry) {
    throw new ApiError(404, "PROVIDER_NOT_FOUND", "供应商不存在");
  }

  const model = entry.models.find((item) => item.model_id === modelId);
  if (!model) {
    throw new ApiError(404, "MODEL_NOT_FOUND", "模型不存在");
  }

  if (thinking && !model.supports_thinking) {
    throw new ApiError(
      400,
      "MODEL_THINKING_UNSUPPORTED",
      "当前模型未启用思考能力",
    );
  }

  return {
    providerName: entry.provider.name,
    protocol: entry.provider.protocol,
    baseUrl: entry.provider.base_url,
    apiKey: decryptSecret(entry.provider.api_key_cipher),
    model,
    thinking,
  };
}

function textFromContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";

  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if (
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
      return "";
    })
    .join("");
}

async function* readSseData(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);

        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data) yield data;
        }

        newline = buffer.indexOf("\n");
      }
    }

    const finalLine = buffer.replace(/\r$/, "");
    if (finalLine.startsWith("data:")) {
      const data = finalLine.slice(5).trim();
      if (data) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function apiErrorFromResponse(status: number): ApiError {
  if (status === 401 || status === 403) {
    return new ApiError(
      400,
      "MODEL_AUTH_FAILED",
      "API Key 无效或没有权限",
    );
  }

  return new ApiError(
    400,
    "MODEL_REQUEST_FAILED",
    `模型返回了 ${status}`,
  );
}

async function requestOpenAi(
  context: ModelTestContext,
  signal: AbortSignal,
) {
  const url = buildProviderEndpoint(
    context.baseUrl,
    "/chat/completions",
  );
  const body: Record<string, unknown> = {
    model: context.model.model_id,
    messages: [{ role: "user", content: PROMPT }],
    stream: context.model.supports_streaming,
  };

  if (context.thinking) {
    body.reasoning_effort = "low";
  }

  return fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${context.apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
    signal,
    redirect: "follow",
  });
}

async function requestAnthropic(
  context: ModelTestContext,
  signal: AbortSignal,
) {
  const url = buildProviderEndpoint(context.baseUrl, "/messages");
  const body: Record<string, unknown> = {
    model: context.model.model_id,
    max_tokens: context.thinking ? 2048 : 128,
    messages: [{ role: "user", content: PROMPT }],
    stream: context.model.supports_streaming,
  };

  if (context.thinking) {
    body.thinking = {
      type: "enabled",
      budget_tokens: 1024,
    };
  }

  return fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": context.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
    signal,
    redirect: "follow",
  });
}

export async function* streamModelTest(
  context: ModelTestContext,
  clientSignal: AbortSignal,
): AsyncGenerator<ModelTestEvent> {
  const startedAt = Date.now();
  const timeout = AbortSignal.timeout(TEST_TIMEOUT_MS);
  const signal = AbortSignal.any([clientSignal, timeout]);

  yield {
    type: "start",
    modelId: context.model.model_id,
    thinking: context.thinking,
    streaming: context.model.supports_streaming,
  };

  let text = "";
  let reasoning = "";

  try {
    const response =
      context.protocol === "anthropic"
        ? await requestAnthropic(context, signal)
        : await requestOpenAi(context, signal);

    if (!response.ok) {
      throw apiErrorFromResponse(response.status);
    }

    if (context.model.supports_streaming) {
      if (!response.body) {
        throw new ApiError(
          400,
          "MODEL_STREAM_INVALID",
          "模型没有返回可读取的流",
        );
      }

      if (context.protocol === "anthropic") {
        for await (const data of readSseData(response.body)) {
          const json = parseJson(data);
          if (!json) {
            throw new ApiError(
              400,
              "MODEL_STREAM_INVALID",
              "模型流式响应格式不正确",
            );
          }

          if (json.type === "error") {
            throw new ApiError(
              400,
              "MODEL_REQUEST_FAILED",
              "模型返回了错误",
            );
          }

          if (json.type !== "content_block_delta") continue;

          const delta = json.delta;
          if (!delta || typeof delta !== "object") continue;
          const deltaRecord = delta as Record<string, unknown>;

          if (
            deltaRecord.type === "text_delta" &&
            typeof deltaRecord.text === "string"
          ) {
            text += deltaRecord.text;
            yield { type: "delta", text: deltaRecord.text };
          } else if (
            deltaRecord.type === "thinking_delta" &&
            typeof deltaRecord.thinking === "string"
          ) {
            reasoning += deltaRecord.thinking;
            yield { type: "reasoning", text: deltaRecord.thinking };
          }
        }
      } else {
        for await (const data of readSseData(response.body)) {
          if (data === "[DONE]") break;

          const json = parseJson(data);
          if (!json) {
            throw new ApiError(
              400,
              "MODEL_STREAM_INVALID",
              "模型流式响应格式不正确",
            );
          }

          if (json.error) {
            throw new ApiError(
              400,
              "MODEL_REQUEST_FAILED",
              "模型返回了错误",
            );
          }

          const choices = json.choices;
          if (!Array.isArray(choices) || choices.length === 0) continue;

          const choice = choices[0];
          if (!choice || typeof choice !== "object") continue;
          const delta = (choice as Record<string, unknown>).delta;
          if (!delta || typeof delta !== "object") continue;
          const deltaRecord = delta as Record<string, unknown>;

          const content = textFromContent(deltaRecord.content);
          if (content) {
            text += content;
            yield { type: "delta", text: content };
          }

          const reasoningText =
            typeof deltaRecord.reasoning_content === "string"
              ? deltaRecord.reasoning_content
              : typeof deltaRecord.reasoning === "string"
                ? deltaRecord.reasoning
                : "";
          if (reasoningText) {
            reasoning += reasoningText;
            yield { type: "reasoning", text: reasoningText };
          }
        }
      }
    } else {
      const payload = (await response.json()) as Record<string, unknown>;

      if (payload.error) {
        throw new ApiError(
          400,
          "MODEL_REQUEST_FAILED",
          "模型返回了错误",
        );
      }

      if (context.protocol === "anthropic") {
        if (Array.isArray(payload.content)) {
          for (const part of payload.content) {
            if (!part || typeof part !== "object") continue;
            const partRecord = part as Record<string, unknown>;
            if (
              partRecord.type === "text" &&
              typeof partRecord.text === "string"
            ) {
              text += partRecord.text;
            } else if (
              partRecord.type === "thinking" &&
              typeof partRecord.thinking === "string"
            ) {
              reasoning += partRecord.thinking;
            }
          }
        }
      } else if (Array.isArray(payload.choices)) {
        const choice = payload.choices[0];
        if (choice && typeof choice === "object") {
          const message = (choice as Record<string, unknown>).message;
          if (message && typeof message === "object") {
            const messageRecord = message as Record<string, unknown>;
            text += textFromContent(messageRecord.content);
            const reasoningText =
              typeof messageRecord.reasoning_content === "string"
                ? messageRecord.reasoning_content
                : typeof messageRecord.reasoning === "string"
                  ? messageRecord.reasoning
                  : "";
            reasoning += reasoningText;
          }
        }
      }

      if (reasoning) {
        yield { type: "reasoning", text: reasoning };
      }
      if (text) {
        yield { type: "delta", text };
      }
    }

    if (!text.trim()) {
      yield {
        type: "error",
        code: "MODEL_EMPTY_RESPONSE",
        message: "模型没有返回内容",
      };
      return;
    }

    yield {
      type: "done",
      durationMs: Date.now() - startedAt,
      textLength: text.length,
    };
  } catch (error) {
    if (clientSignal.aborted) return;

    if (timeout.aborted) {
      yield {
        type: "error",
        code: "MODEL_TIMEOUT",
        message: "模型测试超时",
      };
      return;
    }

    if (error instanceof ApiError) {
      yield {
        type: "error",
        code: error.code,
        message: error.message,
      };
      return;
    }

    yield {
      type: "error",
      code: "MODEL_REQUEST_FAILED",
      message: "模型调用失败",
    };
  }
}
