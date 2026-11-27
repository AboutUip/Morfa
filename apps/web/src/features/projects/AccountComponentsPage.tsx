import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { LayersIcon } from "../../components/icons";
import {
  accountComponentApi,
  type AccountComponent,
  type AuthUser,
  type CanvasPageDto,
  type ProjectSummary,
} from "../../lib/api";
import { getPageSize } from "./canvasDocument";
import { CanvasNodeView } from "./CanvasNodeView";
import { CanvasWidgetView } from "./CanvasWidgetView";
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
}

interface PreviewCacheEntry {
  pages: CanvasPageDto[];
  defaultStateId: string | null;
}

const previewCache = new Map<string, PreviewCacheEntry>();

function AccountPreview({ componentId }: { componentId: string }) {
  const [preview, setPreview] = useState<PreviewCacheEntry | null>(
    () => previewCache.get(componentId) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void accountComponentApi
      .preview(componentId)
      .then((response) => {
        if (cancelled) return;
        const entry = {
          pages: response.pages,
          defaultStateId: response.defaultStateId,
        };
        previewCache.set(componentId, entry);
        setPreview(entry);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [componentId, preview]);

  const state = useMemo(() => {
    if (!preview) return null;
    return (
      preview.pages.find(
        (page) => page.id === preview.defaultStateId,
      ) ??
      preview.pages.find(
        (page) =>
          page.nodeKind === "control-state" &&
          page.controlId ===
            preview.pages.find(
              (item) => item.nodeKind === "control",
            )?.id,
      ) ??
      null
    );
  }, [preview]);

  if (failed) {
    return (
      <span className={styles.previewMessage}>
        <LayersIcon size={18} />
      </span>
    );
  }
  if (!preview || !state) {
    return (
      <span className={styles.previewSkeleton} aria-hidden="true">
        <LayersIcon size={18} />
      </span>
    );
  }

  const size = getPageSize(state, preview.pages);
  const scale = Math.min(
    1,
    136 / Math.max(1, size.width),
    104 / Math.max(1, size.height),
  );

  return (
    <span className={styles.previewClip}>
      <span
        className={styles.previewArt}
        style={{
          width: size.width,
          height: size.height,
          transform: `scale(${scale})`,
        }}
      >
        <CanvasNodeView
          page={state}
          pages={preview.pages}
          root
          position={{ left: 0, top: 0 }}
          maxDepth={8}
        />
      </span>
    </span>
  );
}

function BuiltInPreview({ item }: { item: MarketItem }) {
  const { t } = useTranslation();
  if (item.type === "widget") {
    return (
      <span
        className={styles.widgetPreview}
        style={{ aspectRatio: `${item.width} / ${item.height}` }}
      >
        <CanvasWidgetView
          widget={{
            ...item.widget,
            ...(item.textKey ? { text: t(item.textKey) } : {}),
          }}
        />
      </span>
    );
  }
  if (item.frame) {
    return (
      <span
        className={styles.devicePreview}
        data-frame={item.frame}
        aria-hidden="true"
      />
    );
  }
  return (
    <span className={styles.blankPreview} aria-hidden="true">
      <LayersIcon size={20} />
    </span>
  );
}

export function AccountComponentsPage({
  user,
  projects,
  onLogin,
  onOpenProject,
}: AccountComponentsPageProps) {
  const { t } = useTranslation();
  const [components, setComponents] = useState<AccountComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
      setNotice(t("components.deleted", { name: component.name }));
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

  const builtInItems = useMemo(() => {
    const buckets = new Map<MarketCategory, MarketItem[]>();
    for (const category of MARKET_CATEGORY_ORDER) {
      buckets.set(category, []);
    }
    for (const item of COMPONENT_MARKET) {
      const category: MarketCategory =
        item.type === "container" ? "containers" : item.category;
      buckets.get(category)?.push(item);
    }
    return [...buckets.entries()].flatMap(([category, items]) =>
      items.map((item) => ({ item, category })),
    );
  }, []);

  if (!user) {
    return (
      <section
        id="panel-components"
        className={styles.state}
        role="tabpanel"
        aria-labelledby="tab-components"
      >
        <span className={styles.stateIcon}>
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

  return (
    <section
      id="panel-components"
      className={styles.page}
      role="tabpanel"
      aria-labelledby="tab-components"
    >
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
      <div className={styles.grid}>
        {loading
          ? null
          : components.map((component) => {
              const sourceProject = component.sourceProjectId
                ? projects.find(
                    (project) =>
                      project.id === component.sourceProjectId,
                  ) ?? null
                : null;
              const confirming = confirmId === component.id;
              const busy = busyId === component.id;
              return (
                <article
                  className={styles.tile}
                  data-kind="account"
                  key={component.id}
                >
                  <div className={styles.cover}>
                    <AccountPreview componentId={component.id} />
                    {confirming ? (
                      <div className={styles.confirmOverlay}>
                        <span>{t("components.deleteConfirm")}</span>
                        <div>
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
                      </div>
                    ) : null}
                    <div className={styles.tileActions}>
                      {sourceProject ? (
                        <button
                          className={styles.action}
                          type="button"
                          onClick={() => onOpenProject(sourceProject)}
                        >
                          {t("components.openSourceShort")}
                        </button>
                      ) : null}
                      <button
                        className={styles.action}
                        type="button"
                        onClick={() => setConfirmId(component.id)}
                      >
                        {t("components.delete")}
                      </button>
                    </div>
                  </div>
                  <div className={styles.footer}>
                    <strong>{component.name}</strong>
                    <span>
                      {t("components.counts", {
                        states: component.stateCount,
                        nodes: component.nodeCount,
                      })}
                    </span>
                  </div>
                </article>
              );
            })}
        {builtInItems.map(({ item, category }) => (
          <article
            className={styles.tile}
            data-kind="builtin"
            key={item.id}
          >
            <div className={styles.cover}>
              <BuiltInPreview item={item} />
            </div>
            <div className={styles.footer}>
              <strong>{t(item.nameKey)}</strong>
              <span>{t(MARKET_CATEGORY_LABEL_KEYS[category])}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
