import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { ChevronDownIcon } from "../../components/icons";
import {
  modelProviderApi,
  type ModelProvider,
  type ModelProviderProtocol,
} from "../../lib/api";
import { apiErrorMessage } from "../../lib/apiErrors";
import styles from "./ProfilePanel.module.css";
import type { RequestVCode } from "./types";

interface ModelTabProps {
  requestVCode: RequestVCode;
}

type ProviderBusy = "sync" | "delete" | "reveal";

const INITIAL_FORM = {
  protocol: "openai" as ModelProviderProtocol,
  name: "",
  baseUrl: "",
  apiKey: "",
};

function providerHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function ModelTab({ requestVCode }: ModelTabProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en-US" ? "en-US" : "zh-CN";
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [providerBusy, setProviderBusy] = useState<
    Record<string, ProviderBusy | undefined>
  >({});
  const [providerErrors, setProviderErrors] = useState<
    Record<string, string | null | undefined>
  >({});
  const [revealedKeys, setRevealedKeys] = useState<
    Record<string, string | undefined>
  >({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(
    null,
  );

  const baseUrlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    modelProviderApi
      .list()
      .then(({ providers: nextProviders }) => {
        if (active) setProviders(nextProviders);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            apiErrorMessage(t, error, "profile.models.errors.loadFailed"),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t, reloadNonce]);

  useEffect(() => {
    if (!addOpen) return;
    const frame = requestAnimationFrame(() => baseUrlRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [addOpen]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteId]);

  const setProviderError = (id: string, value: string | null) => {
    setProviderErrors((current) => ({ ...current, [id]: value }));
  };

  const setProviderBusyState = (
    id: string,
    value: ProviderBusy | undefined,
  ) => {
    setProviderBusy((current) => ({ ...current, [id]: value }));
  };

  const hideKey = (id: string) => {
    setRevealedKeys((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const toggleProvider = (provider: ModelProvider) => {
    const isOpen = expandedIds.has(provider.id);
    if (isOpen) hideKey(provider.id);

    setExpandedIds((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(provider.id);
      else next.add(provider.id);
      return next;
    });
  };

  const handleRevealKey = (provider: ModelProvider) => {
    if (revealedKeys[provider.id]) {
      hideKey(provider.id);
      return;
    }

    setProviderError(provider.id, null);

    requestVCode("reveal_api_key", async (ticket) => {
      setProviderBusyState(provider.id, "reveal");

      try {
        const { apiKey } = await modelProviderApi.revealKey(
          provider.id,
          ticket,
        );
        setRevealedKeys((current) => ({
          ...current,
          [provider.id]: apiKey,
        }));
      } catch (error) {
        setProviderError(
          provider.id,
          apiErrorMessage(
            t,
            error,
            "profile.models.errors.revealFailed",
          ),
        );
      } finally {
        setProviderBusyState(provider.id, undefined);
      }
    });
  };

  const handleSync = async (provider: ModelProvider) => {
    setProviderError(provider.id, null);
    setProviderBusyState(provider.id, "sync");

    try {
      const { provider: updated } = await modelProviderApi.sync(
        provider.id,
      );
      setProviders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage(t("profile.models.modelsRefreshed"));
    } catch (error) {
      setProviderError(
        provider.id,
        apiErrorMessage(t, error, "profile.models.errors.syncFailed"),
      );
    } finally {
      setProviderBusyState(provider.id, undefined);
    }
  };

  const handleDelete = async (provider: ModelProvider) => {
    if (confirmDeleteId !== provider.id) {
      setConfirmDeleteId(provider.id);
      return;
    }

    setConfirmDeleteId(null);
    setProviderError(provider.id, null);
    setProviderBusyState(provider.id, "delete");

    try {
      await modelProviderApi.remove(provider.id);
      setProviders((current) =>
        current.filter((item) => item.id !== provider.id),
      );
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(provider.id);
        return next;
      });
      hideKey(provider.id);
      setMessage(t("profile.models.deleted"));
    } catch (error) {
      setProviderError(
        provider.id,
        apiErrorMessage(t, error, "profile.models.errors.deleteFailed"),
      );
    } finally {
      setProviderBusyState(provider.id, undefined);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;

    setFormError(null);

    if (!form.baseUrl.trim()) {
      setFormError(t("profile.models.errors.baseUrlRequired"));
      requestAnimationFrame(() => baseUrlRef.current?.focus());
      return;
    }

    if (!form.apiKey.trim()) {
      setFormError(t("profile.models.errors.keyRequired"));
      return;
    }

    setCreating(true);

    try {
      const { provider } = await modelProviderApi.create({
        name: form.name.trim(),
        protocol: form.protocol,
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey,
      });

      setProviders((current) => [...current, provider]);
      setExpandedIds((current) => new Set(current).add(provider.id));
      setForm(INITIAL_FORM);
      setAddOpen(false);
      setMessage(t("profile.models.created"));
    } catch (error) {
      setFormError(
        apiErrorMessage(t, error, "profile.models.errors.createFailed"),
      );
    } finally {
      setCreating(false);
    }
  };

  const protocolLabel = (protocol: ModelProviderProtocol) =>
    protocol === "openai"
      ? t("profile.models.protocolOpenAI")
      : t("profile.models.protocolAnthropic");

  const baseUrlPlaceholder =
    form.protocol === "openai"
      ? t("profile.models.baseUrlPlaceholderOpenAI")
      : t("profile.models.baseUrlPlaceholderAnthropic");

  return (
    <>
      <p className={styles.infoText}>{t("profile.models.intro")}</p>

      <div className={styles.providerToolbar}>
        <button
          className={styles.button}
          type="button"
          onClick={() => {
            setFormError(null);
            setAddOpen((current) => !current);
          }}
          aria-expanded={addOpen}
          aria-controls="provider-form"
        >
          {t("profile.models.add")}
        </button>
        {message ? (
          <p className={styles.successText} role="status">
            {message}
          </p>
        ) : null}
      </div>

      {addOpen ? (
        <form
          id="provider-form"
          className={styles.providerForm}
          onSubmit={handleCreate}
          noValidate
        >
          <div className={styles.providerFormHeader}>
            <h3>{t("profile.models.addTitle")}</h3>
            <button
              className={styles.textButton}
              type="button"
              onClick={() => {
                setAddOpen(false);
                setFormError(null);
              }}
              disabled={creating}
            >
              {t("profile.models.cancel")}
            </button>
          </div>

          <div className={styles.providerFormGrid}>
            <label className={styles.field}>
              <span className={styles.label}>
                {t("profile.models.protocol")}
              </span>
              <select
                className={styles.select}
                value={form.protocol}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    protocol: event.target.value as ModelProviderProtocol,
                  }));
                  setFormError(null);
                }}
                disabled={creating}
              >
                <option value="openai">
                  {t("profile.models.protocolOpenAI")}
                </option>
                <option value="anthropic">
                  {t("profile.models.protocolAnthropic")}
                </option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>
                {t("profile.models.name")}
              </span>
              <input
                className={styles.input}
                type="text"
                value={form.name}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }));
                  setFormError(null);
                }}
                placeholder={t("profile.models.namePlaceholder")}
                maxLength={60}
                disabled={creating}
              />
            </label>

            <label className={`${styles.field} ${styles.gridFull}`}>
              <span className={styles.label}>
                {t("profile.models.baseUrl")}
              </span>
              <input
                ref={baseUrlRef}
                className={styles.input}
                type="url"
                value={form.baseUrl}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }));
                  setFormError(null);
                }}
                placeholder={baseUrlPlaceholder}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={2048}
                disabled={creating}
              />
            </label>

            <label className={`${styles.field} ${styles.gridFull}`}>
              <span className={styles.label}>
                {t("profile.models.apiKey")}
              </span>
              <input
                className={styles.input}
                type="password"
                value={form.apiKey}
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    apiKey: event.target.value,
                  }));
                  setFormError(null);
                }}
                placeholder={t("profile.models.apiKeyPlaceholder")}
                autoComplete="off"
                maxLength={4096}
                disabled={creating}
              />
            </label>
          </div>

          <p className={styles.fieldHint}>
            {t("profile.models.autoFetchHint")}
          </p>

          {formError ? (
            <p className={styles.errorText} role="alert">
              {formError}
            </p>
          ) : null}

          <div className={styles.formActions}>
            <button
              className={styles.button}
              type="submit"
              disabled={creating}
            >
              {creating
                ? t("profile.models.submitting")
                : t("profile.models.submit")}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className={styles.mutedText}>{t("profile.models.loading")}</p>
      ) : loadError ? (
        <div className={styles.providerLoadError}>
          <p className={styles.errorText} role="alert">
            {loadError}
          </p>
          <button
            className={styles.buttonSecondary}
            type="button"
            onClick={() => setReloadNonce((current) => current + 1)}
          >
            {t("profile.models.retry")}
          </button>
        </div>
      ) : providers.length === 0 ? (
        addOpen ? null : (
          <div className={styles.modelsEmpty}>
            <strong>{t("profile.models.emptyTitle")}</strong>
            <p>{t("profile.models.emptyHint")}</p>
          </div>
        )
      ) : (
        <div className={styles.providerList}>
          {providers.map((provider) => {
            const isExpanded = expandedIds.has(provider.id);
            const busy = providerBusy[provider.id];
            const error = providerErrors[provider.id];
            const revealedKey = revealedKeys[provider.id];
            const bodyId = `provider-body-${provider.id}`;
            const lastSynced = provider.lastSyncedAt
              ? dateFormatter.format(new Date(provider.lastSyncedAt))
              : null;

            return (
              <article
                key={provider.id}
                className={styles.providerCard}
              >
                <button
                  className={styles.providerHeader}
                  type="button"
                  onClick={() => toggleProvider(provider)}
                  aria-expanded={isExpanded}
                  aria-controls={bodyId}
                >
                  <span
                    className={styles.protocolBadge}
                    data-protocol={provider.protocol}
                  >
                    {protocolLabel(provider.protocol)}
                  </span>
                  <span className={styles.providerTitle}>
                    <strong>{provider.name}</strong>
                    <span>{providerHost(provider.baseUrl)}</span>
                  </span>
                  <span className={styles.providerModelCount}>
                    {t("profile.models.modelCount", {
                      value: provider.models.length,
                    })}
                  </span>
                  <ChevronDownIcon
                    size={15}
                    className={styles.providerChevron}
                  />
                </button>

                {isExpanded ? (
                  <div
                    id={bodyId}
                    className={styles.providerBody}
                  >
                    <div className={styles.providerMeta}>
                      <span className={styles.label}>
                        {t("profile.models.baseUrlLabel")}
                      </span>
                      <code className={styles.providerBaseUrl}>
                        {provider.baseUrl}
                      </code>
                    </div>

                    <div className={styles.providerKeyRow}>
                      <span className={styles.label}>
                        {t("profile.models.apiKey")}
                      </span>
                      <code
                        className={styles.providerKeyValue}
                        data-revealed={Boolean(revealedKey)}
                      >
                        {revealedKey ?? "••••••••••••"}
                      </code>
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={() => handleRevealKey(provider)}
                        disabled={Boolean(busy)}
                      >
                        {revealedKey
                          ? t("profile.models.hideKey")
                          : t("profile.models.revealKey")}
                      </button>
                    </div>
                    <p
                      className={
                        revealedKey
                          ? styles.successText
                          : styles.fieldHint
                      }
                    >
                      {revealedKey
                        ? t("profile.models.keyVerified")
                        : t("profile.models.keyHint")}
                    </p>

                    <div className={styles.providerModelsHeader}>
                      <span>{t("profile.models.availableModels")}</span>
                      <span>
                        {t("profile.models.modelCount", {
                          value: provider.models.length,
                        })}
                      </span>
                    </div>

                    {provider.models.length > 0 ? (
                      <ul className={styles.providerModelList}>
                        {provider.models.map((model) => {
                          const label = model.displayName ?? model.id;
                          return (
                            <li
                              key={model.id}
                              className={styles.providerModelItem}
                            >
                              <span>{label}</span>
                              {model.displayName &&
                              model.displayName !== model.id ? (
                                <code>{model.id}</code>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className={styles.mutedText}>
                        {t("profile.models.noModels")}
                      </p>
                    )}

                    <p className={styles.providerSyncedAt}>
                      {lastSynced
                        ? t("profile.models.lastSynced", {
                            date: lastSynced,
                          })
                        : t("profile.models.neverSynced")}
                    </p>

                    <div className={styles.providerActions}>
                      <button
                        className={styles.buttonSecondary}
                        type="button"
                        onClick={() => handleSync(provider)}
                        disabled={Boolean(busy)}
                      >
                        {busy === "sync"
                          ? t("profile.models.refreshing")
                          : t("profile.models.refresh")}
                      </button>
                      <button
                        className={styles.dangerButton}
                        type="button"
                        onClick={() => handleDelete(provider)}
                        disabled={Boolean(busy)}
                      >
                        {busy === "delete"
                          ? t("profile.models.deleting")
                          : confirmDeleteId === provider.id
                            ? t("profile.models.deleteConfirm")
                            : t("profile.models.delete")}
                      </button>
                    </div>

                    {error ? (
                      <p className={styles.errorText} role="alert">
                        {error}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
