import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import {
  CheckIcon,
  ChevronDownIcon,
  GlobeIcon,
  LogoutIcon,
  MoonIcon,
  SunIcon,
} from "../../components/icons";
import { setLocale, type Locale } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { useAuth } from "../auth/AuthProvider";
import styles from "./ProjectTopBar.module.css";

const LANGUAGE_LABELS: Record<Locale, string> = {
  "zh-CN": "中文",
  "en-US": "English",
};

export type WorkspaceTab = "projects" | "components" | "settings";

const TABS: Array<{ id: WorkspaceTab; labelKey: string }> = [
  { id: "projects", labelKey: "nav.projects" },
  { id: "components", labelKey: "nav.components" },
  { id: "settings", labelKey: "nav.settings" },
];

interface ProjectTopBarProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onLogin: () => void;
}

export function ProjectTopBar({
  activeTab,
  onTabChange,
  onLogin,
}: ProjectTopBarProps) {
  const { t, i18n } = useTranslation();
  const { resolved, toggle } = useTheme();
  const { user, status, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  const languageAreaRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);

  const currentLocale: Locale =
    i18n.resolvedLanguage === "en-US" ? "en-US" : "zh-CN";

  useEffect(() => {
    if (!languageOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!languageAreaRef.current?.contains(event.target as Node)) {
        setLanguageOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLanguageOpen(false);
        languageButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [languageOpen]);

  const selectLanguage = (locale: Locale) => {
    setLocale(locale);
    setLanguageOpen(false);
    languageButtonRef.current?.focus();
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.warn("[morfa] logout failed", error);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className={styles.topBar}>
      <div className={styles.brandGroup}>
        <BrandMark size={26} />
        <span className={styles.pipe} aria-hidden="true">
          |
        </span>
        <span className={styles.productName}>{t("app.productName")}</span>
      </div>

      <nav className={styles.nav} role="tablist" aria-label={t("nav.primary")}>
        {TABS.map((tab, index) => (
          <Fragment key={tab.id}>
            {index > 0 ? (
              <span className={styles.navSeparator} aria-hidden="true">
                |
              </span>
            ) : null}
            <button
              id={`tab-${tab.id}`}
              className={styles.navTab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              data-active={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            >
              {t(tab.labelKey)}
            </button>
          </Fragment>
        ))}
      </nav>

      <div className={styles.actions}>
        <button
          className={styles.iconButton}
          type="button"
          title={t("app.toggleTheme")}
          aria-label={t("app.toggleTheme")}
          onClick={toggle}
        >
          {resolved === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
        </button>

        <div className={styles.languageArea} ref={languageAreaRef}>
          <button
            ref={languageButtonRef}
            className={styles.languageButton}
            type="button"
            title={t("app.switchLanguage")}
            aria-label={t("app.switchLanguage")}
            aria-haspopup="menu"
            aria-expanded={languageOpen}
            aria-controls="language-menu"
            onClick={() => setLanguageOpen((open) => !open)}
          >
            <GlobeIcon size={14} />
            <span className={styles.languageLabel}>
              {LANGUAGE_LABELS[currentLocale]}
            </span>
            <ChevronDownIcon size={10} className={styles.chevron} />
          </button>

          {languageOpen ? (
            <div
              id="language-menu"
              className={styles.languageMenu}
              role="menu"
              aria-label={t("app.switchLanguage")}
            >
              {(Object.keys(LANGUAGE_LABELS) as Locale[]).map((locale) => (
                <button
                  key={locale}
                  className={styles.languageItem}
                  type="button"
                  role="menuitemradio"
                  aria-checked={locale === currentLocale}
                  data-active={locale === currentLocale}
                  onClick={() => selectLanguage(locale)}
                >
                  <span>{LANGUAGE_LABELS[locale]}</span>
                  {locale === currentLocale ? (
                    <CheckIcon size={13} className={styles.check} />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <span className={styles.divider} aria-hidden="true" />

        {status === "loading" ? (
          <span className={styles.authSkeleton} aria-hidden="true" />
        ) : user ? (
          <div className={styles.user}>
            <span className={styles.avatar}>
              <img src={user.avatarUrl} alt="" />
            </span>
            <span className={styles.nickname}>{user.nickname}</span>
            <button
              className={styles.logoutButton}
              type="button"
              title={t("auth.logout")}
              aria-label={t("auth.logout")}
              onClick={handleLogout}
              disabled={loggingOut}
            >
              <LogoutIcon size={14} />
            </button>
          </div>
        ) : (
          <button className={styles.loginButton} type="button" onClick={onLogin}>
            {t("auth.loginCta")}
          </button>
        )}
      </div>
    </header>
  );
}
