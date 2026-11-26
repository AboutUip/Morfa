export interface AuthUser {
  id: string;
  nickname: string;
  loginAccount: string;
  avatarUrl: string;
  createdAt: number;
}

export type LoginResponse =
  | {
      user: AuthUser;
      requiresVCodeSetup?: false;
    }
  | {
      requiresVCodeSetup: true;
      setupToken: string;
      expiresAt: number;
      preview: AuthUser;
    };

export interface RegisterResponse {
  user: AuthUser;
  importedProjectCount: number;
}

export interface VCodeTicket {
  ticket: string;
  expiresAt: number;
}

export type VCodePurpose =
  | "password_reset"
  | "export"
  | "cancel"
  | "reveal_api_key";

export type ProjectType = "software" | "website";
export type ProjectVisibility = "public" | "private" | "shared";
export type ProjectRole = "owner" | "member";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  visibility: ProjectVisibility;
  iconUrl: string | null;
  shareCode: string | null;
  role: ProjectRole;
  ownerName: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProjectInput {
  type: ProjectType;
  name: string;
  description: string;
  visibility: ProjectVisibility;
  iconDataUrl?: string | null;
  requestId?: string | null;
}

export type CanvasDataType =
  | "text"
  | "number"
  | "color"
  | "date"
  | "boolean";

export interface CanvasDataEntryDto {
  key: string;
  type: CanvasDataType;
  value: string;
  commit?: string;
}

export type CanvasWidgetKind =
  | "button"
  | "select"
  | "text"
  | "input"
  | "search"
  | "textarea"
  | "checkbox"
  | "radio"
  | "toggle"
  | "progress"
  | "slider"
  | "image"
  | "video"
  | "avatar"
  | "badge"
  | "card"
  | "tabs"
  | "alert"
  | "divider"
  | "chart";

export interface CanvasWidgetDto {
  kind: CanvasWidgetKind;
  variant?: string;
  text?: string;
  value?: number;
  src?: string;
}

export interface CanvasPageDto {
  id: string;
  name: string;
  x: number;
  y: number;
  styles: Record<string, string>;
  frame?: "iphone" | "android" | "watch";
  lockedSize?: boolean;
  parentId?: string;
  data?: CanvasDataEntryDto[];
  widget?: CanvasWidgetDto;
}

export type CanvasLinkDirection = "one-way" | "two-way";
export type CanvasLinkEdge = "top" | "right" | "bottom" | "left";

export interface CanvasLinkAnchorDto {
  x: number;
  y: number;
  edge: CanvasLinkEdge;
}

export interface CanvasLinkDto {
  id: string;
  fromId: string;
  toId: string;
  direction: CanvasLinkDirection;
  color: string;
  width: number;
  dashed: boolean;
  fromAnchor: CanvasLinkAnchorDto;
  toAnchor: CanvasLinkAnchorDto;
  createdAt: number;
}

export interface ProjectCanvasResponse {
  pages: CanvasPageDto[];
  links: CanvasLinkDto[];
  updatedAt: number;
}

export interface ModelProviderModel {
  id: string;
  displayName: string | null;
  createdAt: number | null;
  supportsStreaming: boolean;
  supportsThinking: boolean;
  supportsMultimodal: boolean;
}

export type ModelProviderProtocol = "openai" | "anthropic";

export interface ModelProvider {
  id: string;
  name: string;
  protocol: ModelProviderProtocol;
  baseUrl: string;
  models: ModelProviderModel[];
  createdAt: number;
  updatedAt: number;
  lastSyncedAt: number | null;
}

export interface ExportSummary {
  createdAt: number;
  fileSize: number;
  downloadUrl: string;
}

export type UserLocale = "zh-CN" | "en-US";
export type UserThemeMode = "system" | "light" | "dark";

export interface UserPreferences {
  locale: UserLocale | null;
  themeMode: UserThemeMode | null;
  updatedAt: number | null;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  allowVCode: boolean;
  allowPassword: boolean;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type McpCategory =
  | "system"
  | "appearance"
  | "profile"
  | "security"
  | "data"
  | "models";

export interface McpLocalizedText {
  "zh-CN": string;
  "en-US": string;
}

export interface McpPermissionRequirements {
  vcode: boolean;
  password: boolean;
}

export interface McpCapabilitySummary {
  name: string;
  title: McpLocalizedText;
  description: McpLocalizedText;
  category: McpCategory;
  requirements: McpPermissionRequirements;
  available: boolean | null;
}

export interface McpInputPropertySchema {
  type: "string" | "boolean" | "number";
  description: string;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
}

export interface McpInputSchema {
  type: "object";
  properties: Record<string, McpInputPropertySchema>;
  required?: string[];
  additionalProperties?: false;
}

export interface McpCapabilityDetail extends McpCapabilitySummary {
  usage: McpLocalizedText;
  returns: McpLocalizedText;
  inputSchema: McpInputSchema;
  examples: Array<{
    title?: McpLocalizedText;
    arguments: Record<string, unknown>;
  }>;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      credentials: "include",
      ...init,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the Morfa API");
  }

  if (!response.ok) {
    let code = "UNKNOWN";
    let message = `Request failed (${response.status})`;

    try {
      const body = (await response.json()) as ErrorEnvelope;
      if (body.error?.code) code = body.error.code;
      if (body.error?.message) message = body.error.message;
    } catch {
      // 非 JSON 错误响应；保留默认信息
    }

    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const authApi = {
  me: () => request<{ user: AuthUser | null }>("/api/auth/me"),

  login: (loginAccount: string, password: string) =>
    request<LoginResponse>("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginAccount, password }),
    }),

  setupVCode: (setupToken: string, code: string) =>
    request<{ user: AuthUser }>("/api/auth/vcode-setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setupToken, code }),
    }),

  register: (formData: FormData) =>
    request<RegisterResponse>("/api/auth/register", {
      method: "POST",
      body: formData,
    }),

  logout: () =>
    request<void>("/api/auth/logout", {
      method: "POST",
    }),
};

export const projectApi = {
  list: () =>
    request<{ projects: ProjectSummary[] }>("/api/me/projects"),

  create: (input: CreateProjectInput) =>
    request<{ project: ProjectSummary }>("/api/me/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),

  join: (code: string) =>
    request<{ project: ProjectSummary }>("/api/me/projects/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }),
};

export const projectCanvasApi = {
  get: (projectId: string) =>
    request<ProjectCanvasResponse>(
      `/api/me/projects/${encodeURIComponent(projectId)}/canvas`,
    ),

  save: (
    projectId: string,
    pages: CanvasPageDto[],
    links: CanvasLinkDto[],
  ) =>
    request<ProjectCanvasResponse>(
      `/api/me/projects/${encodeURIComponent(projectId)}/canvas`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pages, links }),
      },
    ),
};

export const profileApi = {
  updateProfile: (nickname: string) =>
    request<{ user: AuthUser }>("/api/me/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname }),
    }),

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    return request<{ user: AuthUser }>("/api/me/avatar", {
      method: "POST",
      body: formData,
    });
  },

  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
  }) =>
    request<void>("/api/me/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),

  verifyPassword: (currentPassword: string) =>
    request<void>("/api/me/password/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword }),
    }),

  verifyVCode: (code: string, purpose: VCodePurpose) =>
    request<VCodeTicket>("/api/me/vcode/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, purpose }),
    }),

  resetPassword: (input: {
    ticket: string;
    newPassword: string;
  }) =>
    request<void>("/api/me/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),

  getExport: () =>
    request<{ export: ExportSummary | null }>("/api/me/export"),

  createExport: (ticket: string) =>
    request<{ export: ExportSummary }>("/api/me/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket }),
    }),

  cancelAccount: (input: { ticket: string; password: string }) =>
    request<void>("/api/me/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};

export const preferencesApi = {
  get: () =>
    request<{ preferences: UserPreferences }>("/api/me/preferences"),

  update: (input: {
    locale?: UserLocale;
    themeMode?: UserThemeMode;
  }) =>
    request<{ preferences: UserPreferences }>("/api/me/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};

export const apiKeyApi = {
  list: () => request<{ keys: ApiKeySummary[] }>("/api/me/api-keys"),

  create: (input: {
    name: string;
    allowVCode: boolean;
    allowPassword: boolean;
  }) =>
    request<{ key: ApiKeySummary; apiKey: string }>("/api/me/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),

  update: (
    keyId: string,
    input: {
      name?: string;
      allowVCode?: boolean;
      allowPassword?: boolean;
    },
  ) =>
    request<{ key: ApiKeySummary }>(
      `/api/me/api-keys/${encodeURIComponent(keyId)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    ),

  remove: (keyId: string) =>
    request<void>(`/api/me/api-keys/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    }),
};

export const mcpApi = {
  capabilities: () =>
    request<{ count: number; capabilities: McpCapabilitySummary[] }>(
      "/api/me/mcp/capabilities",
    ),

  capability: (name: string) =>
    request<{ capability: McpCapabilityDetail }>(
      `/api/me/mcp/capabilities/${encodeURIComponent(name)}`,
    ),
};

export const modelProviderApi = {
  list: () =>
    request<{ providers: ModelProvider[] }>("/api/me/model-providers"),

  create: (input: {
    name: string;
    protocol: ModelProviderProtocol;
    baseUrl: string;
    apiKey: string;
  }) =>
    request<{ provider: ModelProvider }>("/api/me/model-providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),

  sync: (providerId: string) =>
    request<{ provider: ModelProvider }>(
      `/api/me/model-providers/${encodeURIComponent(providerId)}/sync`,
      { method: "POST" },
    ),

  remove: (providerId: string) =>
    request<void>(
      `/api/me/model-providers/${encodeURIComponent(providerId)}`,
      { method: "DELETE" },
    ),

  revealKey: (providerId: string, ticket: string) =>
    request<{ apiKey: string }>(
      `/api/me/model-providers/${encodeURIComponent(
        providerId,
      )}/reveal-key`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticket }),
      },
    ),

  updateModelCapabilities: (
    providerId: string,
    modelId: string,
    capabilities: {
      supportsStreaming: boolean;
      supportsThinking: boolean;
      supportsMultimodal: boolean;
    },
  ) =>
    request<{ provider: ModelProvider }>(
      `/api/me/model-providers/${encodeURIComponent(
        providerId,
      )}/models`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelId, ...capabilities }),
      },
    ),

  testStream: async (
    providerId: string,
    modelId: string,
    thinking: boolean,
    signal: AbortSignal,
  ): Promise<Response> => {
    try {
      return await fetch(
        `/api/me/model-providers/${encodeURIComponent(providerId)}/test`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ modelId, thinking }),
          signal,
        },
      );
    } catch {
      throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the Morfa API");
    }
  },
};
