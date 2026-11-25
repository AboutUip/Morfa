import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ApiError,
  authApi,
  type AuthUser,
  type RegisterResponse,
} from "../../lib/api";
import { getLocale, setLocale } from "../../lib/i18n";
import {
  preferencesRealtime,
  realtimeClient,
} from "../../lib/realtime";
import { useTheme } from "../../lib/theme";

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
  const { mode, setMode } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [pendingVCodeSetup, setPendingVCodeSetup] =
    useState<PendingVCodeSetup | null>(null);
  const setModeRef = useRef(setMode);
  const modeRef = useRef(mode);

  useEffect(() => {
    setModeRef.current = setMode;
    modeRef.current = mode;
  }, [mode, setMode]);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let active = true;

    const applyPreferences = (
      preferences: Awaited<
        ReturnType<typeof preferencesRealtime.get>
      >,
    ) => {
      if (preferences.locale && preferences.locale !== getLocale()) {
        setLocale(preferences.locale);
      }
      if (
        preferences.themeMode &&
        preferences.themeMode !== modeRef.current
      ) {
        setModeRef.current(preferences.themeMode);
      }
    };

    const loadPreferences = async () => {
      try {
        const preferences = await preferencesRealtime.get();
        if (active) applyPreferences(preferences);
      } catch {
        // 实时与 HTTP 回退都失败时保留当前本地设置
      }
    };

    void realtimeClient.ensureConnected().catch(() => {
      // 后续请求会自动回退到 HTTP
    });

    const unsubscribe = preferencesRealtime.subscribe((preferences) => {
      if (active) applyPreferences(preferences);
    });
    const unsubscribeReconnect = realtimeClient.onReconnected(
      (reconnected) => {
        if (reconnected) void loadPreferences();
      },
    );

    void loadPreferences();

    return () => {
      active = false;
      unsubscribe();
      unsubscribeReconnect();
    };
  }, [userId]);

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
    realtimeClient.disconnect();
    setUser(null);
    setPendingVCodeSetup(null);
  }, []);

  const applyUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const clearUser = useCallback(() => {
    realtimeClient.disconnect();
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
