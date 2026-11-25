import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { DownloadIcon } from "../../components/icons";
import { ApiError, profileApi, type ExportSummary } from "../../lib/api";
import { apiErrorMessage } from "../../lib/apiErrors";
import { useAuth } from "../auth/AuthProvider";
import styles from "./ProfilePanel.module.css";
import type { RequestVCode } from "./types";

interface AccountTabProps {
  requestVCode: RequestVCode;
  onClose: () => void;
}

function formatBytes(bytes: number, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  });

  if (bytes < 1024) return `${formatter.format(bytes)} B`;
  if (bytes < 1024 * 1024) {
    return `${formatter.format(bytes / 1024)} KB`;
  }
  return `${formatter.format(bytes / (1024 * 1024))} MB`;
}

export function AccountTab({ requestVCode, onClose }: AccountTabProps) {
  const { t, i18n } = useTranslation();
  const { user, clearUser } = useAuth();
  const locale = i18n.resolvedLanguage === "en-US" ? "en-US" : "zh-CN";

  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(
    null,
  );
  const [exportLoading, setExportLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    profileApi
      .getExport()
      .then(({ export: summary }) => {
        if (active) setExportSummary(summary);
      })
      .catch((error: unknown) => {
        if (active) {
          setExportError(
            apiErrorMessage(t, error, "profile.errors.exportFailed"),
          );
        }
      })
      .finally(() => {
        if (active) setExportLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t]);

  if (!user) return null;

  const joinedAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(new Date(user.createdAt));

  const exportCreatedAt = exportSummary
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(exportSummary.createdAt))
    : null;

  const handleCreateExport = () => {
    requestVCode("export", async (ticket) => {
      setExportBusy(true);
      setExportError(null);
      setExportMessage(null);

      try {
        const { export: summary } = await profileApi.createExport(ticket);
        setExportSummary(summary);
        setExportMessage(t("profile.export.ready"));
      } catch (error) {
        setExportError(
          apiErrorMessage(t, error, "profile.errors.exportFailed"),
        );
      } finally {
        setExportBusy(false);
      }
    });
  };

  const handleCancelSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (cancelBusy) return;

    setCancelError(null);

    if (!cancelPassword) {
      setCancelError(t("profile.errors.currentPasswordRequired"));
      return;
    }

    requestVCode("cancel", async (ticket) => {
      setCancelBusy(true);

      try {
        await profileApi.cancelAccount({
          ticket,
          password: cancelPassword,
        });
        clearUser();
        onClose();
      } catch (error) {
        setCancelError(
          apiErrorMessage(t, error, "profile.errors.cancelFailed"),
        );
        if (error instanceof ApiError && error.code === "TICKET_INVALID") {
          setCancelError(t("vcode.errors.expired"));
        }
      } finally {
        setCancelBusy(false);
      }
    });
  };

  return (
    <>
      <dl className={styles.details}>
        <div>
          <dt>{t("profile.loginAccount")}</dt>
          <dd>{user.loginAccount}</dd>
        </div>
        <div>
          <dt>{t("profile.userId")}</dt>
          <dd>
            <code>{user.id}</code>
          </dd>
        </div>
        <div>
          <dt>{t("profile.status")}</dt>
          <dd>{t("profile.active")}</dd>
        </div>
        <div>
          <dt>{t("profile.joined")}</dt>
          <dd>{joinedAt}</dd>
        </div>
      </dl>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>{t("profile.export.title")}</h3>
        </div>
        <p className={styles.infoText}>{t("profile.export.description")}</p>

        <div className={styles.card} aria-busy={exportLoading || exportBusy}>
          {exportLoading ? (
            <span className={styles.mutedText}>
              {t("profile.export.loading")}
            </span>
          ) : exportSummary ? (
            <div className={styles.exportMeta}>
              <div className={styles.exportLine}>
                <span>{t("profile.export.createdAt")}</span>
                <strong>{exportCreatedAt}</strong>
              </div>
              <div className={styles.exportLine}>
                <span>{t("profile.export.fileSize")}</span>
                <strong>
                  {formatBytes(exportSummary.fileSize, locale)}
                </strong>
              </div>
            </div>
          ) : (
            <span className={styles.mutedText}>
              {t("profile.export.empty")}
            </span>
          )}

          <div className={styles.formActions}>
            <button
              className={styles.button}
              type="button"
              onClick={handleCreateExport}
              disabled={exportBusy}
            >
              {exportBusy
                ? t("profile.export.creating")
                : exportSummary
                  ? t("profile.export.recreate")
                  : t("profile.export.create")}
            </button>

            {exportSummary ? (
              <a
                className={styles.buttonSecondary}
                href={exportSummary.downloadUrl}
                download
              >
                <DownloadIcon size={14} />
                {t("profile.export.download")}
              </a>
            ) : null}
          </div>

          {exportMessage ? (
            <p className={styles.successText} role="status">
              {exportMessage}
            </p>
          ) : null}
          {exportError ? (
            <p className={styles.errorText} role="alert">
              {exportError}
            </p>
          ) : null}
        </div>

        <p className={styles.warningText}>{t("profile.export.warning")}</p>
      </section>

      <section className={`${styles.section} ${styles.dangerSection}`}>
        <div className={styles.sectionHeader}>
          <h3>{t("profile.cancel.title")}</h3>
        </div>
        <p className={styles.infoText}>{t("profile.cancel.description")}</p>
        <p className={styles.warningText}>{t("profile.cancel.warning")}</p>

        <form className={styles.form} onSubmit={handleCancelSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>
              {t("profile.cancel.password")}
            </span>
            <input
              className={styles.input}
              type="password"
              value={cancelPassword}
              onChange={(event) => {
                setCancelPassword(event.target.value);
                setCancelError(null);
              }}
              autoComplete="current-password"
              maxLength={128}
              disabled={cancelBusy}
              aria-invalid={Boolean(cancelError)}
            />
          </label>
          <div className={styles.formActions}>
            <button
              className={styles.dangerButton}
              type="submit"
              disabled={cancelBusy || !cancelPassword}
            >
              {cancelBusy
                ? t("profile.cancel.cancelling")
                : t("profile.cancel.confirm")}
            </button>
          </div>
          {cancelError ? (
            <p className={styles.errorText} role="alert">
              {cancelError}
            </p>
          ) : null}
        </form>
      </section>
    </>
  );
}
