import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { LayersIcon } from "../../components/icons";
import {
  accountComponentApi,
  type AccountComponent,
  type AuthUser,
  type ProjectSummary,
} from "../../lib/api";
import {
  COMPONENT_MARKET,
  MARKET_CATEGORY_LABEL_KEYS,
  MARKET_CATEGORY_ORDER,
  type MarketCategory,
  type MarketItem,
} from "./componentMarket";
import styles from "./AccountComponentsPage.module.css";

interface AccountComponentsPageProps {
  user: AuthUser | null;
  projects: ProjectSummary[];
  onLogin: () => void;
  onOpenProject: (project: ProjectSummary) => void;
  onGoToProjects: () => void;
}

export function AccountComponentsPage({
  user,
  projects,
  onLogin,
  onOpenProject,
  onGoToProjects,
}: AccountComponentsPageProps) {
  const { t, i18n } = useTranslation();
  const [components, setComponents] = useState<AccountComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const locale = i18n.resolvedLanguage === "en-US" ? "en-US" : "zh-CN";
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const catalogGroups = useMemo(() => {
    const buckets = new Map<MarketCategory, MarketItem[]>();
    for (const category of MARKET_CATEGORY_ORDER) {
      buckets.set(category, []);
    }
    for (const item of COMPONENT_MARKET) {
      const category: MarketCategory =
        item.type === "container" ? "containers" : item.category;
      buckets.get(category)?.push(item);
    }
    return [...buckets.entries()].filter(([, items]) => items.length > 0);
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      setComponents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await accountComponentApi.list();
      setComponents(response.components);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("components.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (component: AccountComponent) => {
    setBusyId(component.id);
    setError("");
    try {
      await accountComponentApi.remove(component.id);
      setConfirmId(null);
      setNotice(
        t("components.deleted", { name: component.name }),
      );
      await load();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : t("components.deleteFailed"),
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!user) {
    return (
      <section
        id="panel-components"
        className={styles.state}
        role="tabpanel"
        aria-labelledby="tab-components"
      >
        <span className={styles.icon}>
          <LayersIcon size={22} />
        </span>
        <h2>{t("components.loginTitle")}</h2>
        <p>{t("components.loginHint")}</p>
        <button className={styles.primary} type="button" onClick={onLogin}>
          {t("projects.loginCta")}
        </button>
      </section>
    );
  }

  const totalStates = components.reduce(
    (total, component) => total + component.stateCount,
    0,
  );
  const totalNodes = components.reduce(
    (total, component) => total + component.nodeCount,
    0,
  );

  return (
    <section
      id="panel-components"
      className={styles.page}
      role="tabpanel"
      aria-labelledby="tab-components"
    >
      <header className={styles.header}>
        <div>
          <h2>{t("components.title")}</h2>
          <p>{t("components.subtitle")}</p>
        </div>
        <div className={styles.stats}>
          <span>
            {t("components.totalStats", {
              count: components.length + COMPONENT_MARKET.length,
              account: components.length,
              builtIn: COMPONENT_MARKET.length,
            })}
          </span>
        </div>
      </header>
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h3>{t("components.yourComponents")}</h3>
            <p>{t("components.yourComponentsHint")}</p>
          </div>
          {components.length > 0 ? (
            <span className={styles.sectionCount}>
              {t("components.accountStats", {
                count: components.length,
                states: totalStates,
                nodes: totalNodes,
              })}
            </span>
          ) : null}
        </div>
        {loading ? (
          <div className={styles.accountEmpty} aria-busy="true">
            <span className={styles.loadingDot} aria-hidden="true" />
            <p>{t("components.loading")}</p>
          </div>
        ) : null}
        {!loading && components.length === 0 ? (
          <div className={styles.accountEmpty}>
            <h4>{t("components.emptyTitle")}</h4>
            <p>{t("components.emptyHint")}</p>
            <button
              className={styles.ghost}
              type="button"
              onClick={onGoToProjects}
            >
              {t("components.goToProjects")}
            </button>
          </div>
        ) : null}
        <div className={styles.grid}>
        {components.map((component) => {
          const sourceProject = component.sourceProjectId
            ? projects.find(
                (project) => project.id === component.sourceProjectId,
              ) ?? null
            : null;
          const confirming = confirmId === component.id;
          const busy = busyId === component.id;
          return (
            <article className={styles.card} key={component.id}>
              <div className={styles.cardTop}>
                <span className={styles.glyph} aria-hidden="true">
                  <LayersIcon size={18} />
                </span>
                <div className={styles.identity}>
                  <h3>{component.name}</h3>
                  <span>
                    {t("components.counts", {
                      states: component.stateCount,
                      nodes: component.nodeCount,
                    })}
                  </span>
                </div>
              </div>
              {component.description ? (
                <p className={styles.description}>
                  {component.description}
                </p>
              ) : null}
              {component.controlNames.length > 1 ? (
                <p className={styles.controls}>
                  {component.controlNames.join(" · ")}
                </p>
              ) : null}
              <div className={styles.meta}>
                <span>
                  {sourceProject
                    ? t("components.sourceProject", {
                        name: sourceProject.name,
                      })
                    : t("components.accountLevel")}
                </span>
                <span>
                  {dateFormatter.format(component.updatedAt)}
                </span>
              </div>
              {confirming ? (
                <div className={styles.confirm}>
                  <span>{t("components.deleteConfirm")}</span>
                  <button
                    className={styles.danger}
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(component)}
                  >
                    {t("components.delete")}
                  </button>
                  <button
                    className={styles.ghost}
                    type="button"
                    onClick={() => setConfirmId(null)}
                  >
                    {t("components.cancel")}
                  </button>
                </div>
              ) : (
                <div className={styles.actions}>
                  {sourceProject ? (
                    <button
                      className={styles.primary}
                      type="button"
                      onClick={() => onOpenProject(sourceProject)}
                    >
                      {t("components.openSource")}
                    </button>
                  ) : null}
                  <button
                    className={styles.ghost}
                    type="button"
                    onClick={() => setConfirmId(component.id)}
                  >
                    {t("components.delete")}
                  </button>
                </div>
              )}
            </article>
          );
        })}
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h3>{t("components.builtInTitle")}</h3>
            <p>{t("components.builtInHint")}</p>
          </div>
          <span className={styles.sectionCount}>
            {COMPONENT_MARKET.length}
          </span>
        </div>
        {catalogGroups.map(([category, items]) => (
          <div className={styles.catalogGroup} key={category}>
            <h4>{t(MARKET_CATEGORY_LABEL_KEYS[category])}</h4>
            <div className={styles.catalogGrid}>
              {items.map((item) => (
                <article className={styles.catalogCard} key={item.id}>
                  <span className={styles.catalogGlyph} aria-hidden="true">
                    <LayersIcon size={14} />
                  </span>
                  <div>
                    <strong>{t(item.nameKey)}</strong>
                    <p>{t(item.descriptionKey)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
    </section>
  );
}
