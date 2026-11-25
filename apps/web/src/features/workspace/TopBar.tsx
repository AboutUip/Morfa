import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import { MoonIcon, SunIcon } from "../../components/icons";
import { setLocale } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import styles from "./TopBar.module.css";

export function TopBar() {
  const { t, i18n } = useTranslation();
  const { resolved, toggle } = useTheme();
  const isChinese = i18n.resolvedLanguage?.startsWith("zh") ?? true;
  const nextLocale = isChinese ? "en-US" : "zh-CN";

  return (
    <header className={styles.topBar}>
      <div className={styles.brandGroup}>
        <BrandMark size={26} />
        <span className={styles.pipe} aria-hidden="true">
          |
        </span>
        <span className={styles.projectName}>{t("workspace.projectName")}</span>
      </div>

      <div className={styles.status}>
        <span className={styles.statusDot} aria-hidden="true" />
        <span>{t("workspace.ready")}</span>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.iconButton}
          type="button"
          title={t("workspace.theme")}
          aria-label={t("workspace.theme")}
          onClick={toggle}
        >
          {resolved === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
        </button>
        <button
          className={`${styles.iconButton} ${styles.languageButton}`}
          type="button"
          title={t("workspace.language")}
          aria-label={t("workspace.language")}
          onClick={() => setLocale(nextLocale)}
        >
          {isChinese ? "EN" : "中"}
        </button>
        <span className={styles.divider} aria-hidden="true" />
        <span className={styles.avatar} aria-hidden="true">
          M
        </span>
      </div>
    </header>
  );
}
