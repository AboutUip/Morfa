export interface AuthUser {
  id: string;
  nickname: string;
  loginAccount: string;
  avatarUrl: string;
  createdAt: number;
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
    request<{ user: AuthUser }>("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginAccount, password }),
    }),

  register: (formData: FormData) =>
    request<{ user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: formData,
    }),

  logout: () =>
    request<void>("/api/auth/logout", {
      method: "POST",
    }),
};
