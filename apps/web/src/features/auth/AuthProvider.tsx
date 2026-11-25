import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError, authApi, type AuthUser } from "../../lib/api";

type AuthStatus = "loading" | "ready";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (loginAccount: string, password: string) => Promise<AuthUser>;
  register: (formData: FormData) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let active = true;

    authApi
      .me()
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
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
    const { user: nextUser } = await authApi.login(loginAccount, password);
    setUser(nextUser);
    setStatus("ready");
    return nextUser;
  }, []);

  const register = useCallback(async (formData: FormData) => {
    const { user: nextUser } = await authApi.register(formData);
    setUser(nextUser);
    setStatus("ready");
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
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
