import { listCustomSignals } from "../db/automation.js";
import { ApiError } from "../lib/errors.js";
import { updateUserPreferences } from "../services/preferences.js";
import type { LocalizedText } from "./signals.js";

export interface ActionExecutionContext {
  userId: string;
  runId: string;
  eventId: string;
  depth: number;
  correlationId: string;
  emitSignal: (
    signalKey: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export interface ActionOption {
  value: string;
  label: LocalizedText;
}

export interface ActionField {
  key: string;
  type: "text" | "textarea" | "select" | "number";
  label: LocalizedText;
  required?: boolean;
  placeholder?: LocalizedText;
  options?: ActionOption[];
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  defaultValue?: string | number;
}

export interface AutomationActionDefinition {
  type: string;
  title: LocalizedText;
  description: LocalizedText;
  fields: ActionField[];
  validate: (
    userId: string,
    config: Record<string, unknown>,
  ) => Record<string, unknown>;
  execute: (
    context: ActionExecutionContext,
    config: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

function invalid(message: string): never {
  throw new ApiError(400, "AUTOMATION_ACTION_INVALID", message);
}

function readString(
  config: Record<string, unknown>,
  key: string,
  label: string,
  maxLength = 200,
): string {
  const value = config[key];
  if (typeof value !== "string" || !value.trim()) {
    invalid(`${label}不能为空`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    invalid(`${label}过长`);
  }
  return trimmed;
}

const THEME_OPTIONS: ActionOption[] = [
  {
    value: "system",
    label: { "zh-CN": "跟随系统", "en-US": "System" },
  },
  { value: "light", label: { "zh-CN": "浅色", "en-US": "Light" } },
  { value: "dark", label: { "zh-CN": "深色", "en-US": "Dark" } },
];

const LOCALE_OPTIONS: ActionOption[] = [
  { value: "zh-CN", label: { "zh-CN": "简体中文", "en-US": "简体中文" } },
  { value: "en-US", label: { "zh-CN": "English", "en-US": "English" } },
];

const DEFAULT_ACTIONS: AutomationActionDefinition[] = [
  {
    type: "preferences.set_theme",
    title: { "zh-CN": "设置主题", "en-US": "Set theme" },
    description: {
      "zh-CN": "修改当前用户的界面主题。",
      "en-US": "Change the current user's interface theme.",
    },
    fields: [
      {
        key: "theme",
        type: "select",
        label: { "zh-CN": "主题", "en-US": "Theme" },
        required: true,
        options: THEME_OPTIONS,
        defaultValue: "system",
      },
    ],
    validate(_userId, config) {
      const theme = readString(config, "theme", "主题", 16);
      if (!["system", "light", "dark"].includes(theme)) {
        invalid("主题设置不正确");
      }
      return { theme };
    },
    async execute(context, config) {
      const theme = config.theme as "system" | "light" | "dark";
      const preferences = updateUserPreferences(context.userId, {
        themeMode: theme,
      });
      return { theme: preferences.themeMode };
    },
  },
  {
    type: "preferences.set_language",
    title: { "zh-CN": "设置语言", "en-US": "Set language" },
    description: {
      "zh-CN": "修改当前用户的界面语言。",
      "en-US": "Change the current user's interface language.",
    },
    fields: [
      {
        key: "locale",
        type: "select",
        label: { "zh-CN": "语言", "en-US": "Language" },
        required: true,
        options: LOCALE_OPTIONS,
        defaultValue: "zh-CN",
      },
    ],
    validate(_userId, config) {
      const locale = readString(config, "locale", "语言", 16);
      if (!["zh-CN", "en-US"].includes(locale)) {
        invalid("语言设置不正确");
      }
      return { locale };
    },
    async execute(context, config) {
      const locale = config.locale as "zh-CN" | "en-US";
      const preferences = updateUserPreferences(context.userId, { locale });
      return { locale: preferences.locale };
    },
  },
  {
    type: "signal.emit",
    title: { "zh-CN": "发送信号", "en-US": "Emit signal" },
    description: {
      "zh-CN": "向另一个自定义信号发送事件，可用于串联自动化。",
      "en-US":
        "Emit another custom signal to chain automations together.",
    },
    fields: [
      {
        key: "signalKey",
        type: "select",
        label: { "zh-CN": "目标信号", "en-US": "Target signal" },
        required: true,
      },
    ],
    validate(userId, config) {
      const signalKey = readString(
        config,
        "signalKey",
        "目标信号",
        120,
      );
      if (!signalKey.startsWith("custom.")) {
        invalid("只能发送自定义信号");
      }
      if (!listCustomSignals(userId).some((s) => s.signal_key === signalKey)) {
        invalid("目标自定义信号不存在");
      }
      return { signalKey };
    },
    async execute(context, config) {
      const signalKey = config.signalKey as string;
      await context.emitSignal(signalKey, {
        sourceTriggerRunId: context.runId,
      });
      return { emitted: signalKey };
    },
  },
];

const ACTION_MAP = new Map<string, AutomationActionDefinition>();

const ACTION_TYPE_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

export function registerAutomationAction(
  definition: AutomationActionDefinition,
): () => void {
  const type = definition.type.trim();
  if (!ACTION_TYPE_PATTERN.test(type)) {
    throw new ApiError(
      500,
      "AUTOMATION_ACTION_TYPE_INVALID",
      "动作类型格式不正确",
    );
  }
  if (ACTION_MAP.has(type)) {
    throw new ApiError(
      500,
      "AUTOMATION_ACTION_TYPE_EXISTS",
      `动作类型已注册：${type}`,
    );
  }

  ACTION_MAP.set(type, { ...definition, type });
  return () => {
    ACTION_MAP.delete(type);
  };
}

for (const action of DEFAULT_ACTIONS) {
  registerAutomationAction(action);
}

export function getActionDefinition(
  type: string,
): AutomationActionDefinition | undefined {
  return ACTION_MAP.get(type);
}

export function listActionDefinitions(
  userId: string,
): AutomationActionDefinition[] {
  const customSignalOptions = listCustomSignals(userId).map((signal) => ({
    value: signal.signal_key,
    label: {
      "zh-CN": signal.name,
      "en-US": signal.name,
    },
  }));

  return [...ACTION_MAP.values()].map((action) =>
    action.type === "signal.emit"
      ? {
          ...action,
          fields: action.fields.map((field) =>
            field.key === "signalKey"
              ? { ...field, options: customSignalOptions }
              : field,
          ),
        }
      : action,
  );
}

export function validateActionList(
  userId: string,
  input: unknown,
): Array<{ type: string; config: Record<string, unknown> }> {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ApiError(
      400,
      "AUTOMATION_ACTIONS_REQUIRED",
      "至少需要一个执行动作",
    );
  }

  if (input.length > 10) {
    throw new ApiError(
      400,
      "AUTOMATION_ACTIONS_TOO_MANY",
      "单个触发器最多支持 10 个动作",
    );
  }

  return input.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ApiError(
        400,
        "AUTOMATION_ACTION_INVALID",
        `第 ${index + 1} 个动作格式不正确`,
      );
    }

    const record = entry as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    const definition = ACTION_MAP.get(type);
    if (!definition) {
      throw new ApiError(
        400,
        "AUTOMATION_ACTION_INVALID",
        `第 ${index + 1} 个动作类型不存在`,
      );
    }

    const config =
      record.config &&
      typeof record.config === "object" &&
      !Array.isArray(record.config)
        ? (record.config as Record<string, unknown>)
        : {};

    return {
      type,
      config: definition.validate(userId, config),
    };
  });
}

export type { AutomationActionDefinition as ActionDefinition };
