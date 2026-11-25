import { randomUUID } from "node:crypto";

import {
  deleteProviderModels,
  deleteProviderRecord,
  findProviderForUser,
  findProviderWithModels,
  insertProvider,
  insertProviderModels,
  listProvidersWithModels,
  touchProvider,
  updateProviderModelCapabilities,
  updateProviderSynced,
  type ProviderProtocol,
  type ProviderWithModels,
} from "../db/modelProviders.js";
import { transaction } from "../db/transaction.js";
import type { UserRow } from "../db/users.js";
import { ApiError } from "../lib/errors.js";
import { consumeTicketOrThrow } from "./vcode.js";
import { decryptSecret, encryptSecret } from "./secretBox.js";

const MAX_PROVIDER_NAME = 60;
const MAX_BASE_URL = 2048;
const MAX_API_KEY = 4096;
const MAX_MODELS = 500;
const MAX_MODEL_ID = 300;
const MAX_DISPLAY_NAME = 200;
const FETCH_TIMEOUT_MS = 15_000;

interface RemoteModel {
  id: string;
  displayName: string | null;
  createdAt: number | null;
  capabilities: {
    streaming?: boolean;
    thinking?: boolean;
    multimodal?: boolean;
  };
}

export interface ModelProviderDto {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  models: Array<{
    id: string;
    displayName: string | null;
    createdAt: number | null;
    supportsStreaming: boolean;
    supportsThinking: boolean;
    supportsMultimodal: boolean;
  }>;
  createdAt: number;
  updatedAt: number;
  lastSyncedAt: number | null;
}

export interface CreateProviderInput {
  name: string;
  protocol: string;
  baseUrl: string;
  apiKey: string;
}

function validateProtocol(value: string): ProviderProtocol {
  if (value === "openai" || value === "anthropic") return value;
  throw new ApiError(400, "PROVIDER_PROTOCOL_INVALID", "供应商协议不正确");
}

function normalizeBaseUrl(value: string): string {
  const raw = value.trim();
  if (!raw || raw.length > MAX_BASE_URL) {
    throw new ApiError(
      400,
      "PROVIDER_BASE_URL_INVALID",
      "Base URL 格式不正确",
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(
      400,
      "PROVIDER_BASE_URL_INVALID",
      "Base URL 格式不正确",
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ApiError(
      400,
      "PROVIDER_BASE_URL_INVALID",
      "Base URL 仅支持 HTTP 或 HTTPS",
    );
  }

  if (url.username || url.password) {
    throw new ApiError(
      400,
      "PROVIDER_BASE_URL_INVALID",
      "Base URL 不能包含账号信息",
    );
  }

  url.hash = "";
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname || "/";

  return url.toString().replace(/\/$/, "");
}

function resolveProviderName(
  inputName: string,
  protocol: ProviderProtocol,
  baseUrl: string,
): string {
  const name = inputName.trim();
  if (name) {
    if (name.length > MAX_PROVIDER_NAME) {
      throw new ApiError(
        400,
        "PROVIDER_NAME_INVALID",
        "供应商名称不能超过 60 个字符",
      );
    }
    return name;
  }

  const label = protocol === "openai" ? "OpenAI" : "Anthropic";
  const host = new URL(baseUrl).host;
  return `${label} · ${host}`.slice(0, MAX_PROVIDER_NAME);
}

function validateApiKey(value: string): string {
  const apiKey = value.trim();
  if (!apiKey || apiKey.length > MAX_API_KEY) {
    throw new ApiError(
      400,
      "PROVIDER_KEY_REQUIRED",
      "请输入有效的 API Key",
    );
  }
  return apiKey;
}

function buildModelsUrl(baseUrl: string): string {
  return buildProviderEndpoint(baseUrl, "/models");
}

export function buildProviderEndpoint(
  baseUrl: string,
  suffix: string,
): string {
  const url = new URL(baseUrl);
  let pathname = url.pathname.replace(/\/+$/, "");

  if (!pathname || pathname === "/") {
    pathname = `/v1${suffix}`;
  } else if (!pathname.endsWith(suffix)) {
    pathname = `${pathname}${suffix}`;
  }

  url.pathname = pathname;
  return url.toString();
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function detectCapabilities(record: Record<string, unknown>): {
  streaming?: boolean;
  thinking?: boolean;
  multimodal?: boolean;
} {
  const capabilities: {
    streaming?: boolean;
    thinking?: boolean;
    multimodal?: boolean;
  } = {};

  const supported = record.supported_parameters;
  if (Array.isArray(supported)) {
    const values = supported.filter(
      (value): value is string => typeof value === "string",
    );
    if (
      values.some((value) =>
        ["reasoning", "reasoning_effort", "include_reasoning"].includes(
          value,
        ),
      )
    ) {
      capabilities.thinking = true;
    }
    if (values.includes("stream")) capabilities.streaming = true;
  }

  const architecture = record.architecture;
  if (architecture && typeof architecture === "object") {
    const architectureRecord = architecture as Record<string, unknown>;
    const modality = architectureRecord.modality;
    if (
      typeof modality === "string" &&
      /image|vision|multimodal/i.test(modality)
    ) {
      capabilities.multimodal = true;
    }

    const inputModalities = architectureRecord.input_modalities;
    if (Array.isArray(inputModalities)) {
      if (
        inputModalities.some(
          (value) =>
            typeof value === "string" &&
            /image|vision|multimodal/i.test(value),
        )
      ) {
        capabilities.multimodal = true;
      }
    }
  }

  const remoteCapabilities = record.capabilities;
  if (remoteCapabilities && typeof remoteCapabilities === "object") {
    const capabilityRecord = remoteCapabilities as Record<string, unknown>;

    const direct = {
      streaming: parseBoolean(capabilityRecord.streaming),
      thinking: parseBoolean(capabilityRecord.thinking),
      multimodal:
        parseBoolean(capabilityRecord.vision) ??
        parseBoolean(capabilityRecord.multimodal),
    };
    if (direct.streaming !== undefined) {
      capabilities.streaming = direct.streaming;
    }
    if (direct.thinking !== undefined) {
      capabilities.thinking = direct.thinking;
    }
    if (direct.multimodal !== undefined) {
      capabilities.multimodal = direct.multimodal;
    }

    const imageInput = capabilityRecord.image_input;
    if (imageInput && typeof imageInput === "object") {
      const supportedValue = parseBoolean(
        (imageInput as Record<string, unknown>).supported,
      );
      if (supportedValue !== undefined) {
        capabilities.multimodal = supportedValue;
      }
    }

    const thinking = capabilityRecord.thinking;
    if (thinking && typeof thinking === "object") {
      const supportedValue = parseBoolean(
        (thinking as Record<string, unknown>).supported,
      );
      if (supportedValue !== undefined) {
        capabilities.thinking = supportedValue;
      }
    }

    const streaming = capabilityRecord.streaming;
    if (streaming && typeof streaming === "object") {
      const supportedValue = parseBoolean(
        (streaming as Record<string, unknown>).supported,
      );
      if (supportedValue !== undefined) {
        capabilities.streaming = supportedValue;
      }
    }
  }

  const directStreaming =
    parseBoolean(record.supports_streaming) ??
    parseBoolean(record.supportsStreaming);
  if (directStreaming !== undefined) {
    capabilities.streaming = directStreaming;
  }

  const directThinking =
    parseBoolean(record.supports_thinking) ??
    parseBoolean(record.supportsThinking) ??
    parseBoolean(record.supports_reasoning);
  if (directThinking !== undefined) {
    capabilities.thinking = directThinking;
  }

  const directMultimodal =
    parseBoolean(record.supports_multimodal) ??
    parseBoolean(record.supportsMultimodal) ??
    parseBoolean(record.supports_vision);
  if (directMultimodal !== undefined) {
    capabilities.multimodal = directMultimodal;
  }

  return capabilities;
}

function parseModels(payload: unknown): RemoteModel[] {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(
      400,
      "PROVIDER_RESPONSE_INVALID",
      "模型列表返回格式不正确",
    );
  }

  const body = payload as Record<string, unknown>;
  const items = Array.isArray(body.data)
    ? body.data
    : Array.isArray(body.models)
      ? body.models
      : null;

  if (!items) {
    throw new ApiError(
      400,
      "PROVIDER_RESPONSE_INVALID",
      "模型列表返回格式不正确",
    );
  }

  const models = new Map<string, RemoteModel>();

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id || id.length > MAX_MODEL_ID) continue;

    const rawDisplayName =
      typeof record.display_name === "string"
        ? record.display_name
        : typeof record.name === "string"
          ? record.name
          : null;
    const displayName = rawDisplayName
      ? rawDisplayName.trim().slice(0, MAX_DISPLAY_NAME) || null
      : null;

    const createdAt =
      toTimestamp(record.created_at) ?? toTimestamp(record.created);

    if (!models.has(id)) {
      models.set(id, {
        id,
        displayName,
        createdAt,
        capabilities: detectCapabilities(record),
      });
    }

    if (models.size >= MAX_MODELS) break;
  }

  return [...models.values()].sort((left, right) =>
    (left.displayName ?? left.id).localeCompare(
      right.displayName ?? right.id,
    ),
  );
}

async function fetchRemoteModels(
  protocol: ProviderProtocol,
  baseUrl: string,
  apiKey: string,
): Promise<RemoteModel[]> {
  const modelsUrl = buildModelsUrl(baseUrl);
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (protocol === "openai") {
    headers.authorization = `Bearer ${apiKey}`;
  } else {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  let response: Response;
  try {
    response = await fetch(modelsUrl, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw new ApiError(
        408,
        "PROVIDER_TIMEOUT",
        "连接模型供应商超时",
      );
    }

    throw new ApiError(
      400,
      "PROVIDER_UNREACHABLE",
      "无法连接模型供应商",
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(
        400,
        "PROVIDER_AUTH_FAILED",
        "API Key 无效或没有权限",
      );
    }

    throw new ApiError(
      400,
      "PROVIDER_FETCH_FAILED",
      `模型供应商返回了 ${response.status}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      400,
      "PROVIDER_RESPONSE_INVALID",
      "模型列表返回格式不正确",
    );
  }

  return parseModels(payload);
}

function toDto(entry: ProviderWithModels): ModelProviderDto {
  return {
    id: entry.provider.id,
    name: entry.provider.name,
    protocol: entry.provider.protocol,
    baseUrl: entry.provider.base_url,
    models: entry.models.map((model) => ({
      id: model.model_id,
      displayName: model.display_name,
      createdAt: model.created_at,
      supportsStreaming: model.supports_streaming,
      supportsThinking: model.supports_thinking,
      supportsMultimodal: model.supports_multimodal,
    })),
    createdAt: entry.provider.created_at,
    updatedAt: entry.provider.updated_at,
    lastSyncedAt: entry.provider.last_synced_at,
  };
}

export function listModelProviders(userId: string): ModelProviderDto[] {
  return listProvidersWithModels(userId).map(toDto);
}

export async function createModelProvider(
  user: UserRow,
  input: CreateProviderInput,
): Promise<ModelProviderDto> {
  const protocol = validateProtocol(input.protocol);
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const name = resolveProviderName(input.name, protocol, baseUrl);
  const apiKey = validateApiKey(input.apiKey);

  const remoteModels = await fetchRemoteModels(protocol, baseUrl, apiKey);
  const providerId = randomUUID();
  const now = Date.now();
  const apiKeyCipher = encryptSecret(apiKey);

  transaction(() => {
    insertProvider({
      id: providerId,
      userId: user.id,
      name,
      protocol,
      baseUrl,
      apiKeyCipher,
      createdAt: now,
    });

    insertProviderModels(
      providerId,
      remoteModels.map((model) => ({
        modelId: model.id,
        displayName: model.displayName,
        createdAt: model.createdAt,
        supportsStreaming: model.capabilities.streaming ?? true,
        supportsThinking: model.capabilities.thinking ?? false,
        supportsMultimodal: model.capabilities.multimodal ?? false,
      })),
    );
  });

  const created = findProviderWithModels(user.id, providerId);
  if (!created) {
    throw new ApiError(
      500,
      "PROVIDER_NOT_FOUND",
      "供应商创建失败",
    );
  }

  return toDto(created);
}

export async function syncModelProvider(
  user: UserRow,
  providerId: string,
): Promise<ModelProviderDto> {
  const existing = findProviderWithModels(user.id, providerId);
  if (!existing) {
    throw new ApiError(404, "PROVIDER_NOT_FOUND", "供应商不存在");
  }

  const provider = existing.provider;
  const previousCapabilities = new Map(
    existing.models.map((model) => [model.model_id, model]),
  );
  const apiKey = decryptSecret(provider.api_key_cipher);
  const remoteModels = await fetchRemoteModels(
    provider.protocol,
    provider.base_url,
    apiKey,
  );
  const now = Date.now();

  transaction(() => {
    deleteProviderModels(provider.id);
    insertProviderModels(
      provider.id,
      remoteModels.map((model) => {
        const previous = previousCapabilities.get(model.id);
        return {
          modelId: model.id,
          displayName: model.displayName,
          createdAt: model.createdAt,
          supportsStreaming:
            previous?.supports_streaming ??
            model.capabilities.streaming ??
            true,
          supportsThinking:
            previous?.supports_thinking ??
            model.capabilities.thinking ??
            false,
          supportsMultimodal:
            previous?.supports_multimodal ??
            model.capabilities.multimodal ??
            false,
        };
      }),
    );
    updateProviderSynced(provider.id, now);
  });

  const updated = findProviderWithModels(user.id, provider.id);
  if (!updated) {
    throw new ApiError(500, "PROVIDER_NOT_FOUND", "供应商不存在");
  }

  return toDto(updated);
}

export function updateModelCapabilities(
  user: UserRow,
  providerId: string,
  modelId: string,
  capabilities: {
    supportsStreaming: boolean;
    supportsThinking: boolean;
    supportsMultimodal: boolean;
  },
): ModelProviderDto {
  const existing = findProviderWithModels(user.id, providerId);
  if (!existing) {
    throw new ApiError(404, "PROVIDER_NOT_FOUND", "供应商不存在");
  }

  if (!existing.models.some((model) => model.model_id === modelId)) {
    throw new ApiError(404, "MODEL_NOT_FOUND", "模型不存在");
  }

  const now = Date.now();

  transaction(() => {
    const updated = updateProviderModelCapabilities({
      providerId,
      modelId,
      supportsStreaming: capabilities.supportsStreaming,
      supportsThinking: capabilities.supportsThinking,
      supportsMultimodal: capabilities.supportsMultimodal,
    });

    if (!updated) {
      throw new ApiError(404, "MODEL_NOT_FOUND", "模型不存在");
    }

    touchProvider(providerId, now);
  });

  const updatedProvider = findProviderWithModels(user.id, providerId);
  if (!updatedProvider) {
    throw new ApiError(404, "PROVIDER_NOT_FOUND", "供应商不存在");
  }

  return toDto(updatedProvider);
}

export function removeModelProvider(
  user: UserRow,
  providerId: string,
) {
  const deleted = deleteProviderRecord(user.id, providerId);
  if (!deleted) {
    throw new ApiError(404, "PROVIDER_NOT_FOUND", "供应商不存在");
  }
}

export function revealModelProviderKey(
  user: UserRow,
  providerId: string,
  ticket: string,
): string {
  const provider = findProviderForUser(user.id, providerId);
  if (!provider) {
    throw new ApiError(404, "PROVIDER_NOT_FOUND", "供应商不存在");
  }

  consumeTicketOrThrow(user.id, "reveal_api_key", ticket);
  return decryptSecret(provider.api_key_cipher);
}
