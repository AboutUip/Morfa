import { useState } from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import { AuthModal } from "../auth/AuthModal";
import { useAuth } from "../auth/AuthProvider";
import { ProjectTopBar } from "./ProjectTopBar";
import styles from "./ProjectsPage.module.css";

export function ProjectsPage() {
  const { t } = useTranslation();
  const { user, status } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <ProjectTopBar onLogin={() => setAuthOpen(true)} />

      <main className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <div>
              <p className={styles.eyebrow}>{t("projects.eyebrow")}</p>
              <h1>{t("projects.title")}</h1>
              <p className={styles.subtitle}>{t("projects.subtitle")}</p>
            </div>
            <span className={styles.count}>{t("projects.count")}</span>
          </header>

          <section className={styles.empty}>
            <div className={styles.emptyIdentity}>
              <BrandMark size={44} />
              <span className={styles.identityPipe} aria-hidden="true">
                |
              </span>
              <span className={styles.identityName}>
                {t("app.productName")}
              </span>
            </div>
            <h2>{t("projects.emptyTitle")}</h2>
            <p>
              {user
                ? t("projects.emptyHintLoggedIn")
                : t("projects.emptyHint")}
            </p>
            {status === "ready" && !user ? (
              <button
                className={styles.loginCta}
                type="button"
                onClick={() => setAuthOpen(true)}
              >
                {t("projects.loginCta")}
              </button>
            ) : null}
          </section>
        </div>
      </main>

      {authOpen ? (
        <AuthModal initialMode="login" onClose={() => setAuthOpen(false)} />
      ) : null}
    </div>
  );
}
