import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "morfa.theme";
const THEME_TRANSITION_MS = 320;

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function readSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemTheme, setSystemTheme] =
    useState<ResolvedTheme>(readSystemTheme);
  const transitionTimer = useRef<number | null>(null);

  const resolved: ResolvedTheme = mode === "system" ? systemTheme : mode;

  const animateThemeChange = useCallback((update: () => void) => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      update();
      return;
    }

    const root = document.documentElement;
    root.dataset.themeTransition = "true";
    update();

    if (transitionTimer.current !== null) {
      window.clearTimeout(transitionTimer.current);
    }
    transitionTimer.current = window.setTimeout(() => {
      delete root.dataset.themeTransition;
      transitionTimer.current = null;
    }, THEME_TRANSITION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current);
        delete document.documentElement.dataset.themeTransition;
      }
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      animateThemeChange(() => {
        setSystemTheme(event.matches ? "dark" : "light");
      });
    };

    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [animateThemeChange]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    root.style.colorScheme = resolved;

    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    themeColor?.setAttribute(
      "content",
      resolved === "dark" ? "#080b10" : "#f3f3f5",
    );
  }, [mode, resolved]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        animateThemeChange(() => setModeState(readStoredMode()));
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [animateThemeChange]);

  const value = useMemo<ThemeContextValue>(() => {
    const setMode = (next: ThemeMode) => {
      animateThemeChange(() => setModeState(next));
      try {
        if (next === "system") {
          localStorage.removeItem(THEME_STORAGE_KEY);
        } else {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        }
      } catch {
        // 忽略隐私模式下的存储失败
      }
    };

    return {
      mode,
      resolved,
      setMode,
      toggle: () => setMode(resolved === "dark" ? "light" : "dark"),
    };
  }, [mode, resolved, animateThemeChange]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
