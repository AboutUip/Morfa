import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enUS from "../locales/en-US/common.json";
import zhCN from "../locales/zh-CN/common.json";

export { i18n };

export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_STORAGE_KEY = "morfa.locale";

function isLocale(value: string | null | undefined): value is Locale {
  return value === "zh-CN" || value === "en-US";
}

function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

function detectLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;

  const languages =
    navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return languages.some((language) => language.toLowerCase().startsWith("zh"))
    ? "zh-CN"
    : "en-US";
}

let initialized = false;

export async function initI18n() {
  if (initialized) return i18n;

  const locale = detectLocale();
  await i18n.use(initReactI18next).init({
    resources: {
      "zh-CN": { common: zhCN },
      "en-US": { common: enUS },
    },
    lng: locale,
    fallbackLng: "zh-CN",
    supportedLngs: [...SUPPORTED_LOCALES],
    defaultNS: "common",
    ns: ["common"],
    interpolation: { escapeValue: false },
  });

  document.documentElement.lang = locale;
  initialized = true;
  return i18n;
}

export function getLocale(): Locale {
  return isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "zh-CN";
}

export function setLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // 忽略隐私模式下的存储失败
  }

  document.documentElement.lang = locale;
  void i18n.changeLanguage(locale);
}
