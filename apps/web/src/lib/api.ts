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

export type VCodePurpose = "password_reset" | "export" | "cancel";

export interface ExportSummary {
  createdAt: number;
  fileSize: number;
  downloadUrl: string;
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
    confirmPassword: string;
  }) =>
    request<void>("/api/me/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
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
    confirmPassword: string;
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
