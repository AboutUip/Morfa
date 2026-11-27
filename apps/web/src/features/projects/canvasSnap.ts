import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export interface CanvasSnapSettings {
  enabled: boolean;
  horizontal: boolean;
  thirds: boolean;
  vertical: boolean;
  componentBounds: boolean;
  grid: boolean;
}

export const DEFAULT_CANVAS_SNAP_SETTINGS: CanvasSnapSettings = {
  enabled: true,
  horizontal: true,
  thirds: true,
  vertical: true,
  componentBounds: true,
  grid: false,
};

const STORAGE_KEY = "morfa.canvas.snapSettings";
const NODE_NAMES_KEY = "morfa.canvas.showNodeNames";

function readBoolean(
  value: unknown,
  fallback: boolean,
): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function loadSettings(): CanvasSnapSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CANVAS_SNAP_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<CanvasSnapSettings> | null;
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_CANVAS_SNAP_SETTINGS;
    }

    return {
      enabled: readBoolean(
        parsed.enabled,
        DEFAULT_CANVAS_SNAP_SETTINGS.enabled,
      ),
      horizontal: readBoolean(
        parsed.horizontal,
        DEFAULT_CANVAS_SNAP_SETTINGS.horizontal,
      ),
      thirds: readBoolean(
        parsed.thirds,
        DEFAULT_CANVAS_SNAP_SETTINGS.thirds,
      ),
      vertical: readBoolean(
        parsed.vertical,
        DEFAULT_CANVAS_SNAP_SETTINGS.vertical,
      ),
      componentBounds: readBoolean(
        parsed.componentBounds,
        DEFAULT_CANVAS_SNAP_SETTINGS.componentBounds,
      ),
      grid: readBoolean(parsed.grid, DEFAULT_CANVAS_SNAP_SETTINGS.grid),
    };
  } catch {
    return DEFAULT_CANVAS_SNAP_SETTINGS;
  }
}

export function useShowNodeNames(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [shown, setShown] = useState(() => {
    try {
      return window.localStorage.getItem(NODE_NAMES_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(NODE_NAMES_KEY, shown ? "1" : "0");
    } catch {
      // 本地存储不可用时保持当前会话内的设置
    }
  }, [shown]);

  return [shown, setShown];
}

export function useCanvasSnapSettings(): [
  CanvasSnapSettings,
  Dispatch<SetStateAction<CanvasSnapSettings>>,
] {
  const [settings, setSettings] =
    useState<CanvasSnapSettings>(loadSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // 本地存储不可用时保持当前会话内的设置
    }
  }, [settings]);

  return [settings, setSettings];
}
