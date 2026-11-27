import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  accountComponentApi,
  type AccountComponent,
} from "../../lib/api";
import styles from "./CanvasAccountLibrary.module.css";

interface CanvasAccountLibraryProps {
  projectId: string;
  refreshKey: number;
  onImport: (componentId: string) => Promise<string>;
}

export function CanvasAccountLibrary({
  projectId,
  refreshKey,
  onImport,
}: CanvasAccountLibraryProps) {
  const { t } = useTranslation();
  const [components, setComponents] = useState<AccountComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await accountComponentApi.list();
      setComponents(response.components);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("projects.workspace.library.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load, projectId, refreshKey]);

  const importComponent = async (component: AccountComponent) => {
    setBusyId(component.id);
    setNotice("");
    setError("");
    try {
      await onImport(component.id);
      setNotice(
        t("projects.workspace.library.imported", {
          name: component.rootControlName || component.name,
        }),
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : t("projects.workspace.library.importFailed"),
      );
    } finally {
      setBusyId(null);
    }
  };

  const removeComponent = async (component: AccountComponent) => {
    setBusyId(component.id);
    setError("");
    try {
      await accountComponentApi.remove(component.id);
      setConfirmId(null);
      setNotice(
        t("projects.workspace.library.deleted", {
          name: component.name,
        }),
      );
      await load();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : t("projects.workspace.library.deleteFailed"),
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <p className={styles.stateText}>
        {t("projects.workspace.library.loading")}
      </p>
    );
  }

  return (
    <div className={styles.library}>
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
      {components.length === 0 ? (
        <div className={styles.empty}>
          <strong>{t("projects.workspace.library.emptyTitle")}</strong>
          <p>{t("projects.workspace.library.emptyHint")}</p>
        </div>
      ) : (
        <div className={styles.list} role="list">
          {components.map((component) => {
            const confirming = confirmId === component.id;
            const busy = busyId === component.id;
            return (
              <article
                className={styles.card}
                key={component.id}
                role="listitem"
              >
                <div className={styles.head}>
                  <strong className={styles.name}>{component.name}</strong>
                  <span className={styles.meta}>
                    {t("projects.workspace.library.counts", {
                      states: component.stateCount,
                      nodes: component.nodeCount,
                    })}
                  </span>
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
                {confirming ? (
                  <div className={styles.confirm}>
                    <span>
                      {t("projects.workspace.library.deleteConfirm")}
                    </span>
                    <button
                      className={styles.danger}
                      type="button"
                      disabled={busy}
                      onClick={() => void removeComponent(component)}
                    >
                      {t("projects.workspace.library.delete")}
                    </button>
                    <button
                      className={styles.ghost}
                      type="button"
                      onClick={() => setConfirmId(null)}
                    >
                      {t("projects.workspace.controls.cancel")}
                    </button>
                  </div>
                ) : (
                  <div className={styles.actions}>
                    <button
                      className={styles.primary}
                      type="button"
                      disabled={busy}
                      onClick={() => void importComponent(component)}
                    >
                      {busy
                        ? t("projects.workspace.library.importing")
                        : t("projects.workspace.library.import")}
                    </button>
                    <button
                      className={styles.ghost}
                      type="button"
                      onClick={() => setConfirmId(component.id)}
                    >
                      {t("projects.workspace.library.delete")}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
