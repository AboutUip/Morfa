import { useState } from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import { LogoutIcon, MoonIcon, SunIcon } from "../../components/icons";
import { setLocale } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { useAuth } from "../auth/AuthProvider";
import styles from "./ProjectTopBar.module.css";

interface ProjectTopBarProps {
  onLogin: () => void;
}

export function ProjectTopBar({ onLogin }: ProjectTopBarProps) {
  const { t, i18n } = useTranslation();
  const { resolved, toggle } = useTheme();
  const { user, status, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const isChinese = i18n.resolvedLanguage?.startsWith("zh") ?? true;
  const nextLocale = isChinese ? "en-US" : "zh-CN";

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
        <button
          className={`${styles.iconButton} ${styles.languageButton}`}
          type="button"
          title={t("app.switchLanguage")}
          aria-label={t("app.switchLanguage")}
          onClick={() => setLocale(nextLocale)}
        >
          {isChinese ? "EN" : "中"}
        </button>
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
