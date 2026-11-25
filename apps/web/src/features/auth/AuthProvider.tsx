import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ApiError,
  authApi,
  type AuthUser,
  type RegisterResponse,
} from "../../lib/api";

type AuthStatus = "loading" | "ready";

export interface PendingVCodeSetup {
  setupToken: string;
  preview: AuthUser;
  expiresAt: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  pendingVCodeSetup: PendingVCodeSetup | null;
  login: (
    loginAccount: string,
    password: string,
  ) => Promise<"ok" | "vcodeSetupRequired">;
  completeVCodeSetup: (code: string) => Promise<void>;
  cancelVCodeSetup: () => void;
  register: (formData: FormData) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
  applyUser: (user: AuthUser) => void;
  clearUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [pendingVCodeSetup, setPendingVCodeSetup] =
    useState<PendingVCodeSetup | null>(null);

  useEffect(() => {
    let active = true;

    authApi
      .me()
      .then(({ user: currentUser }) => {
        if (active) {
          setUser(currentUser);
          if (currentUser) setPendingVCodeSetup(null);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code !== "NETWORK_ERROR") {
          console.warn("[morfa] failed to restore session", error);
        }
      })
      .finally(() => {
        if (active) setStatus("ready");
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (loginAccount: string, password: string) => {
    const result = await authApi.login(loginAccount, password);

    if (result.requiresVCodeSetup) {
      setPendingVCodeSetup({
        setupToken: result.setupToken,
        preview: result.preview,
        expiresAt: result.expiresAt,
      });
      return "vcodeSetupRequired";
    }

    setUser(result.user);
    setStatus("ready");
    setPendingVCodeSetup(null);
    return "ok";
  }, []);

  const completeVCodeSetup = useCallback(
    async (code: string) => {
      if (!pendingVCodeSetup) {
        throw new ApiError(400, "SETUP_TOKEN_INVALID", "缺少 VCode 设置会话");
      }

      const { user: nextUser } = await authApi.setupVCode(
        pendingVCodeSetup.setupToken,
        code,
      );

      setUser(nextUser);
      setStatus("ready");
    },
    [pendingVCodeSetup],
  );

  const cancelVCodeSetup = useCallback(() => {
    setPendingVCodeSetup(null);
  }, []);

  const register = useCallback(async (formData: FormData) => {
    const result = await authApi.register(formData);
    setUser(result.user);
    setStatus("ready");
    setPendingVCodeSetup(null);
    return result;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setPendingVCodeSetup(null);
  }, []);

  const applyUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const clearUser = useCallback(() => {
    setUser(null);
    setPendingVCodeSetup(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      pendingVCodeSetup,
      login,
      completeVCodeSetup,
      cancelVCodeSetup,
      register,
      logout,
      applyUser,
      clearUser,
    }),
    [
      user,
      status,
      pendingVCodeSetup,
      login,
      completeVCodeSetup,
      cancelVCodeSetup,
      register,
      logout,
      applyUser,
      clearUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
