import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslation } from "react-i18next";

import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  SearchIcon,
} from "../../components/icons";
import {
  apiKeyApi,
  type ApiKeySummary,
  type McpCapabilityDetail,
  type McpCapabilitySummary,
} from "../../lib/api";
import { apiErrorMessage } from "../../lib/apiErrors";
import { mcpRealtime } from "../../lib/realtime";
import styles from "./ProfilePanel.module.css";

interface PermissionSwitchProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

function PermissionSwitch({
  label,
  description,
  checked,
  disabled,
  onToggle,
}: PermissionSwitchProps) {
  return (
    <button
      className={styles.apiSwitchRow}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      disabled={disabled}
    >
      <span className={styles.apiSwitchCopy}>
        <span className={styles.apiSwitchLabel}>{label}</span>
        <span className={styles.apiSwitchHint}>{description}</span>
      </span>
      <span
        className={styles.apiSwitchTrack}
        data-checked={checked}
        aria-hidden="true"
      >
        <span className={styles.apiSwitchThumb} />
      </span>
    </button>
  );
}

type PermissionState = {
  allowVCode: boolean;
  allowPassword: boolean;
};

export function ApiTab() {
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

  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [keysNonce, setKeysNonce] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    allowVCode: false,
    allowPassword: false,
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<{
    apiKey: string;
    key: ApiKeySummary;
  } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] =
    useState<PermissionState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(
    null,
  );
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<McpCapabilitySummary[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogNonce, setCatalogNonce] = useState(0);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedCapability, setExpandedCapability] = useState<
    string | null
  >(null);
  const [details, setDetails] = useState<
    Record<string, McpCapabilityDetail>
  >({});
  const [detailLoadingName, setDetailLoadingName] = useState<
    string | null
  >(null);
  const [detailError, setDetailError] = useState<{
    name: string;
    message: string;
  } | null>(null);

  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    let active = true;
    setKeysLoading(true);
    setKeysError(null);

    apiKeyApi
      .list()
      .then(({ keys: next }) => {
        if (active) setKeys(next);
      })
      .catch((error: unknown) => {
        if (active) {
          setKeysError(
            apiErrorMessage(t, error, "profile.api.errors.loadFailed"),
          );
        }
      })
      .finally(() => {
        if (active) setKeysLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t, keysNonce]);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError(null);

    mcpRealtime
      .capabilities()
      .then(({ capabilities }) => {
        if (active) setCatalog(capabilities);
      })
      .catch((error: unknown) => {
        if (active) {
          setCatalogError(
            apiErrorMessage(
              t,
              error,
              "profile.api.errors.catalogFailed",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t, catalogNonce]);

  const filteredCapabilities = useMemo(() => {
    const terms = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (terms.length === 0) return catalog;

    return catalog.filter((capability) => {
      const haystack = [
        capability.name,
        capability.title[locale],
        capability.description[locale],
        capability.category,
        t(`profile.api.categories.${capability.category}`),
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [catalog, locale, query, t]);

  const origin = window.location.origin;
  const mcpEndpoint = `${origin}/mcp`;
  const llmsUrl = `${origin}/llms.txt`;

  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setActionError(null);
      setCopied(key);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(null);
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      setCopied(null);
      setActionError(t("profile.api.errors.copyFailed"));
    }
  };

  const toggleFormPermission = (key: keyof PermissionState) => {
    if (creating) return;
    setFormError(null);
    setForm((current) => ({ ...current, [key]: !current[key] }));
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;

    setCreating(true);
    setFormError(null);

    try {
      const result = await apiKeyApi.create({
        name: form.name.trim(),
        allowVCode: form.allowVCode,
        allowPassword: form.allowPassword,
      });

      setKeys((current) => [result.key, ...current]);
      setNewSecret({ apiKey: result.apiKey, key: result.key });
      setForm({ name: "", allowVCode: false, allowPassword: false });
      setCreateOpen(false);
      setActionError(null);
      setMessage(t("profile.api.created"));
    } catch (error) {
      setFormError(
        apiErrorMessage(t, error, "profile.api.errors.createFailed"),
      );
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (key: ApiKeySummary) => {
    setEditingId(key.id);
    setEditPermissions({
      allowVCode: key.allowVCode,
      allowPassword: key.allowPassword,
    });
    setEditError(null);
    setConfirmDeleteId(null);
  };

  const cancelEditing = () => {
    if (editSaving) return;
    setEditingId(null);
    setEditPermissions(null);
    setEditError(null);
  };

  const toggleEditPermission = (key: keyof PermissionState) => {
    if (editSaving) return;
    setEditError(null);
    setEditPermissions((current) =>
      current ? { ...current, [key]: !current[key] } : current,
    );
  };

  const saveEditing = async () => {
    if (!editingId || !editPermissions || editSaving) return;

    setEditSaving(true);
    setEditError(null);

    try {
      const { key } = await apiKeyApi.update(editingId, editPermissions);
      setKeys((current) =>
        current.map((item) => (item.id === key.id ? key : item)),
      );
      setEditingId(null);
      setEditPermissions(null);
      setActionError(null);
      setMessage(t("profile.api.updated"));
    } catch (error) {
      setEditError(
        apiErrorMessage(t, error, "profile.api.errors.updateFailed"),
      );
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (key: ApiKeySummary) => {
    if (confirmDeleteId !== key.id) {
      setConfirmDeleteId(key.id);
      return;
    }

    setConfirmDeleteId(null);
    setBusyKeyId(key.id);

    try {
      await apiKeyApi.remove(key.id);
      setKeys((current) => current.filter((item) => item.id !== key.id));
      if (editingId === key.id) {
        setEditingId(null);
        setEditPermissions(null);
      }
      if (newSecret?.key.id === key.id) setNewSecret(null);
      setActionError(null);
      setMessage(t("profile.api.deleted"));
    } catch (error) {
      setActionError(
        apiErrorMessage(t, error, "profile.api.errors.deleteFailed"),
      );
    } finally {
      setBusyKeyId(null);
    }
  };

  const toggleCapability = async (capability: McpCapabilitySummary) => {
    if (expandedCapability === capability.name) {
      setExpandedCapability(null);
      return;
    }

    setExpandedCapability(capability.name);
    setDetailError(null);

    if (details[capability.name]) return;

    setDetailLoadingName(capability.name);
    try {
      const { capability: detail } = await mcpRealtime.capability(
        capability.name,
      );
      setDetails((current) => ({
        ...current,
        [capability.name]: detail,
      }));
    } catch (error) {
      setDetailError({
        name: capability.name,
        message: apiErrorMessage(
          t,
          error,
          "profile.api.errors.detailFailed",
        ),
      });
    } finally {
      setDetailLoadingName((current) =>
        current === capability.name ? null : current,
      );
    }
  };

  const countAvailableCapabilities = (key: ApiKeySummary) =>
    catalog.filter(
      (capability) =>
        (!capability.requirements.vcode || key.allowVCode) &&
        (!capability.requirements.password || key.allowPassword),
    ).length;

  const renderRequirementBadges = (
    capability: McpCapabilitySummary,
  ) => (
    <span className={styles.apiCatalogBadges}>
      <span className={styles.apiCatalogCategory}>
        {t(`profile.api.categories.${capability.category}`)}
      </span>
      {capability.requirements.vcode ? (
        <span className={styles.apiRequirementBadge}>VCode</span>
      ) : null}
      {capability.requirements.password ? (
        <span className={styles.apiRequirementBadge}>
          {t("profile.api.passwordBadge")}
        </span>
      ) : null}
      {!capability.requirements.vcode &&
      !capability.requirements.password ? (
        <span className={styles.apiNoRequirement}>
          {t("profile.api.noVerification")}
        </span>
      ) : null}
    </span>
  );

  return (
    <>
      <p className={styles.infoText}>{t("profile.api.intro")}</p>

      <section className={styles.apiSection}>
        <div className={styles.apiSectionHeader}>
          <h3>{t("profile.api.connectionTitle")}</h3>
        </div>
        <p className={styles.apiSectionHint}>
          {t("profile.api.connectionHint")}
        </p>

        <div className={styles.apiEndpointRow}>
          <code className={styles.apiEndpointValue}>{mcpEndpoint}</code>
          <button
            className={styles.textButton}
            type="button"
            onClick={() => copyText(mcpEndpoint, "endpoint")}
          >
            <CopyIcon size={12} />
            {copied === "endpoint"
              ? t("profile.api.copied")
              : t("profile.api.copy")}
          </button>
        </div>

        <div className={styles.apiLinks}>
          <a
            className={styles.apiExternalLink}
            href={llmsUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLinkIcon size={12} />
            <span>llms.txt</span>
          </a>
          <a
            className={styles.buttonSecondary}
            href={llmsUrl}
            download="morfa-mcp-llms.txt"
          >
            <DownloadIcon size={12} />
            {t("profile.api.downloadLlms")}
          </a>
        </div>
        <p className={styles.apiSectionHint}>
          {t("profile.api.llmsHint")}
        </p>
      </section>

      <section className={styles.apiSection}>
        <div className={styles.apiSectionHeader}>
          <div>
            <h3>{t("profile.api.keysTitle")}</h3>
            <p className={styles.apiSectionHint}>
              {t("profile.api.keysHint")}
            </p>
          </div>
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              setFormError(null);
              setCreateOpen((current) => !current);
            }}
            aria-expanded={createOpen}
            aria-controls="api-key-form"
          >
            {t("profile.api.createKey")}
          </button>
        </div>

        {newSecret ? (
          <div className={styles.apiSecretBox}>
            <strong>{t("profile.api.newKeyTitle")}</strong>
            <code className={styles.apiSecretValue}>
              {newSecret.apiKey}
            </code>
            <div className={styles.apiSecretActions}>
              <button
                className={styles.buttonSecondary}
                type="button"
                onClick={() => copyText(newSecret.apiKey, "new-key")}
              >
                {copied === "new-key" ? (
                  <CheckIcon size={12} />
                ) : (
                  <CopyIcon size={12} />
                )}
                {copied === "new-key"
                  ? t("profile.api.copied")
                  : t("profile.api.copyKey")}
              </button>
              <button
                className={styles.textButton}
                type="button"
                onClick={() => setNewSecret(null)}
              >
                {t("profile.api.dismiss")}
              </button>
            </div>
            <p className={styles.apiSecretHint}>
              {t("profile.api.secretWarning")}
            </p>
          </div>
        ) : null}

        {createOpen ? (
          <form
            id="api-key-form"
            className={styles.providerForm}
            onSubmit={handleCreate}
            noValidate
          >
            <div className={styles.providerFormHeader}>
              <h3>{t("profile.api.createTitle")}</h3>
              <button
                className={styles.textButton}
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setFormError(null);
                }}
                disabled={creating}
              >
                {t("profile.api.cancel")}
              </button>
            </div>

            <label className={styles.field}>
              <span className={styles.label}>{t("profile.api.name")}</span>
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
                placeholder={t("profile.api.namePlaceholder")}
                maxLength={60}
                disabled={creating}
              />
            </label>

            <div className={styles.apiSwitchList}>
              <PermissionSwitch
                label={t("profile.api.vcodePermission")}
                description={t("profile.api.vcodePermissionHint")}
                checked={form.allowVCode}
                disabled={creating}
                onToggle={() => toggleFormPermission("allowVCode")}
              />
              <PermissionSwitch
                label={t("profile.api.passwordPermission")}
                description={t("profile.api.passwordPermissionHint")}
                checked={form.allowPassword}
                disabled={creating}
                onToggle={() => toggleFormPermission("allowPassword")}
              />
            </div>

            <p className={styles.fieldHint}>
              {t("profile.api.permissionNote")}
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
                  ? t("profile.api.creating")
                  : t("profile.api.create")}
              </button>
            </div>
          </form>
        ) : null}

        {message ? (
          <p className={styles.successText} role="status">
            {message}
          </p>
        ) : null}

        {actionError ? (
          <p className={styles.errorText} role="alert">
            {actionError}
          </p>
        ) : null}

        {keysLoading ? (
          <p className={styles.mutedText}>{t("profile.api.loading")}</p>
        ) : keysError ? (
          <div className={styles.providerLoadError}>
            <p className={styles.errorText} role="alert">
              {keysError}
            </p>
            <button
              className={styles.buttonSecondary}
              type="button"
              onClick={() => setKeysNonce((current) => current + 1)}
            >
              {t("profile.api.retry")}
            </button>
          </div>
        ) : keys.length === 0 ? (
          createOpen ? null : (
            <div className={styles.modelsEmpty}>
              <strong>{t("profile.api.emptyTitle")}</strong>
              <p>{t("profile.api.emptyHint")}</p>
            </div>
          )
        ) : (
          <div className={styles.apiKeyList}>
            {keys.map((key) => {
              const isEditing = editingId === key.id;
              const busy = busyKeyId === key.id;

              return (
                <article key={key.id} className={styles.apiKeyCard}>
                  <div className={styles.apiKeyHeader}>
                    <div className={styles.apiKeyIdentity}>
                      <strong>{key.name}</strong>
                      <code>
                        {key.prefix}
                        {"•".repeat(8)}
                      </code>
                    </div>
                    <div className={styles.apiKeyActions}>
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={() =>
                          isEditing ? cancelEditing() : startEditing(key)
                        }
                        disabled={busy || editSaving}
                      >
                        {isEditing
                          ? t("profile.api.cancel")
                          : t("profile.api.edit")}
                      </button>
                      <button
                        className={styles.apiDangerAction}
                        type="button"
                        onClick={() => handleDelete(key)}
                        disabled={busy || editSaving}
                      >
                        {busy
                          ? t("profile.api.deleting")
                          : confirmDeleteId === key.id
                            ? t("profile.api.deleteConfirm")
                            : t("profile.api.delete")}
                      </button>
                    </div>
                  </div>

                  <div
                    className={styles.apiKeyBadges}
                    role="group"
                    aria-label={t("profile.api.permissions")}
                  >
                    <span
                      className={styles.apiKeyBadge}
                      data-on={key.allowVCode}
                      title={
                        key.allowVCode
                          ? t("profile.api.enabled")
                          : t("profile.api.disabled")
                      }
                      aria-label={`${t("profile.api.vcodeBadge")}: ${
                        key.allowVCode
                          ? t("profile.api.enabled")
                          : t("profile.api.disabled")
                      }`}
                    >
                      {t("profile.api.vcodeBadge")}
                    </span>
                    <span
                      className={styles.apiKeyBadge}
                      data-on={key.allowPassword}
                      title={
                        key.allowPassword
                          ? t("profile.api.enabled")
                          : t("profile.api.disabled")
                      }
                      aria-label={`${t("profile.api.passwordBadge")}: ${
                        key.allowPassword
                          ? t("profile.api.enabled")
                          : t("profile.api.disabled")
                      }`}
                    >
                      {t("profile.api.passwordBadge")}
                    </span>
                  </div>

                  <p className={styles.apiKeyMeta}>
                    {t("profile.api.keyCreatedAt", {
                      date: dateFormatter.format(
                        new Date(key.createdAt),
                      ),
                    })}
                    {" · "}
                    {key.lastUsedAt
                      ? t("profile.api.keyLastUsed", {
                          date: dateFormatter.format(
                            new Date(key.lastUsedAt),
                          ),
                        })
                      : t("profile.api.keyNeverUsed")}
                  </p>
                  {catalog.length > 0 ? (
                    <p className={styles.apiKeyCapabilityCount}>
                      {t("profile.api.keyCapabilityCount", {
                        available: countAvailableCapabilities(key),
                        total: catalog.length,
                      })}
                    </p>
                  ) : null}

                  {isEditing && editPermissions ? (
                    <div className={styles.apiKeyEditor}>
                      <div className={styles.apiSwitchList}>
                        <PermissionSwitch
                          label={t("profile.api.vcodePermission")}
                          description={t("profile.api.vcodePermissionHint")}
                          checked={editPermissions.allowVCode}
                          disabled={editSaving}
                          onToggle={() =>
                            toggleEditPermission("allowVCode")
                          }
                        />
                        <PermissionSwitch
                          label={t("profile.api.passwordPermission")}
                          description={t(
                            "profile.api.passwordPermissionHint",
                          )}
                          checked={editPermissions.allowPassword}
                          disabled={editSaving}
                          onToggle={() =>
                            toggleEditPermission("allowPassword")
                          }
                        />
                      </div>
                      {editError ? (
                        <p className={styles.errorText} role="alert">
                          {editError}
                        </p>
                      ) : null}
                      <div className={styles.apiKeyEditorActions}>
                        <button
                          className={styles.buttonSecondary}
                          type="button"
                          onClick={cancelEditing}
                          disabled={editSaving}
                        >
                          {t("profile.api.cancel")}
                        </button>
                        <button
                          className={styles.button}
                          type="button"
                          onClick={saveEditing}
                          disabled={editSaving}
                        >
                          {editSaving
                            ? t("profile.api.saving")
                            : t("profile.api.save")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.apiSection}>
        <div className={styles.apiSectionHeader}>
          <div>
            <h3>
              {t("profile.api.catalogTitle")}
              {catalog.length > 0 ? ` · ${catalog.length}` : ""}
            </h3>
            <p className={styles.apiSectionHint}>
              {t("profile.api.catalogHint")}
            </p>
          </div>
          <button
            className={styles.textButton}
            type="button"
            onClick={() => setCatalogOpen((current) => !current)}
            aria-expanded={catalogOpen}
            aria-controls="api-capability-catalog"
          >
            {catalogOpen
              ? t("profile.api.closeCatalog")
              : t("profile.api.openCatalog")}
            <ChevronDownIcon
              size={12}
              className={styles.apiCatalogChevron}
              data-open={catalogOpen}
            />
          </button>
        </div>

        {catalogOpen ? (
          <div id="api-capability-catalog">
            <div className={styles.apiSearchRow}>
              <SearchIcon
                size={14}
                className={styles.apiSearchIcon}
              />
              <input
                className={styles.apiSearchInput}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("profile.api.searchPlaceholder")}
                aria-label={t("profile.api.searchPlaceholder")}
              />
            </div>

            {catalogLoading ? (
              <p className={styles.mutedText}>
                {t("profile.api.loading")}
              </p>
            ) : catalogError ? (
              <div className={styles.providerLoadError}>
                <p className={styles.errorText} role="alert">
                  {catalogError}
                </p>
                <button
                  className={styles.buttonSecondary}
                  type="button"
                  onClick={() => setCatalogNonce((current) => current + 1)}
                >
                  {t("profile.api.retry")}
                </button>
              </div>
            ) : filteredCapabilities.length === 0 ? (
              <p className={styles.mutedText}>
                {t("profile.api.noResults")}
              </p>
            ) : (
              <div className={styles.apiCatalogList}>
                {filteredCapabilities.map((capability) => {
                  const expanded =
                    expandedCapability === capability.name;
                  const detail = details[capability.name];
                  const loading = detailLoadingName === capability.name;
                  const error =
                    detailError?.name === capability.name
                      ? detailError.message
                      : null;

                  return (
                    <article
                      key={capability.name}
                      className={styles.apiCatalogItem}
                    >
                      <button
                        className={styles.apiCatalogButton}
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => void toggleCapability(capability)}
                      >
                        <span className={styles.apiCatalogInfo}>
                          <span className={styles.apiCatalogTitleLine}>
                            <strong>{capability.title[locale]}</strong>
                            <code>{capability.name}</code>
                          </span>
                          <span className={styles.apiCatalogDescription}>
                            {capability.description[locale]}
                          </span>
                          {renderRequirementBadges(capability)}
                        </span>
                        <ChevronDownIcon
                          size={13}
                          className={styles.apiCatalogChevron}
                          data-open={expanded}
                        />
                      </button>

                      {expanded ? (
                        <div className={styles.apiCatalogDetail}>
                          {loading ? (
                            <p className={styles.mutedText}>
                              {t("profile.api.loading")}
                            </p>
                          ) : error ? (
                            <p className={styles.errorText} role="alert">
                              {error}
                            </p>
                          ) : detail ? (
                            <>
                              <p>{detail.usage[locale]}</p>
                              <p>
                                <strong>
                                  {t("profile.api.returns")}
                                </strong>{" "}
                                {detail.returns[locale]}
                              </p>
                              <div className={styles.apiSchemaList}>
                                {Object.entries(
                                  detail.inputSchema.properties,
                                ).map(([name, property]) => (
                                  <div
                                    key={name}
                                    className={styles.apiSchemaRow}
                                  >
                                    <code>{name}</code>
                                    <span>
                                      {locale === "en-US"
                                        ? property.description
                                        : t(
                                            `profile.api.types.${property.type}`,
                                          )}
                                    </span>
                                    {detail.inputSchema.required?.includes(
                                      name,
                                    ) ? (
                                      <em>
                                        {t("profile.api.required")}
                                      </em>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                              {detail.examples[0] ? (
                                <>
                                  <div className={styles.apiDetailLabel}>
                                    {t("profile.api.example")}
                                  </div>
                                  <pre className={styles.apiCodeBlock}>
                                    {JSON.stringify(
                                      detail.examples[0].arguments,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </section>
    </>
  );
}
