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
  preferencesApi,
  type AuthUser,
  type RegisterResponse,
} from "../../lib/api";
import { getLocale, setLocale } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";

type AuthStatus = "loading" | "ready";

// 嵌入式预览与多窗口切换可能连续触发 window focus，偏好同步必须节流，
// 否则每次焦点变化都会产生一次 /api/me/preferences 请求。
const PREFERENCE_SYNC_MIN_INTERVAL_MS = 15_000;
const PREFERENCE_SYNC_POLL_MS = 60_000;

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
  const lastPreferenceSyncRef = useRef(0);

  useEffect(() => {
    setModeRef.current = setMode;
    modeRef.current = mode;
  }, [mode, setMode]);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let active = true;

    const applyPreferences = async (force = false) => {
      if (!active || document.visibilityState === "hidden") return;

      const now = Date.now();
      if (
        !force &&
        now - lastPreferenceSyncRef.current <
          PREFERENCE_SYNC_MIN_INTERVAL_MS
      ) {
        return;
      }
      lastPreferenceSyncRef.current = now;

      try {
        const { preferences } = await preferencesApi.get();
        if (!active) return;

        if (preferences.locale && preferences.locale !== getLocale()) {
          setLocale(preferences.locale);
        }
        if (
          preferences.themeMode &&
          preferences.themeMode !== modeRef.current
        ) {
          setModeRef.current(preferences.themeMode);
        }
      } catch {
        // 偏好同步失败不阻塞主流程，保留当前本地设置
      }
    };

    void applyPreferences(true);
    const interval = window.setInterval(() => {
      void applyPreferences();
    }, PREFERENCE_SYNC_POLL_MS);
    const onFocus = () => void applyPreferences();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void applyPreferences();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
