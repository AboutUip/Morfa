import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { CloseIcon } from "../../components/icons";
import { projectApi } from "../../lib/api";
import { apiErrorMessage } from "../../lib/apiErrors";
import { lockBackground } from "../../lib/backgroundLock";
import { projectsStore } from "../../lib/projects";
import { useAnimatedClose } from "../../lib/useAnimatedClose";
import styles from "./ProjectModal.module.css";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface JoinProjectModalProps {
  onClose: () => void;
  onJoined: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function JoinProjectModal({
  onClose,
  onJoined,
  returnFocusRef,
}: JoinProjectModalProps) {
  const { t } = useTranslation();
  const { closing, beginClose } = useAnimatedClose(onClose);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useLayoutEffect(() => {
    const releaseBackground = lockBackground();
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      cancelAnimationFrame(frame);
      releaseBackground();
      const returnTarget = returnFocusRef?.current ?? trigger;
      if (returnTarget?.isConnected) {
        requestAnimationFrame(() => {
          if (returnTarget.isConnected) returnTarget.focus();
        });
      }
    };
  }, []);

  const requestClose = () => {
    if (busyRef.current) return;
    beginClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);

      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyRef.current || !code.trim()) return;

    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const { project } = await projectApi.join(code.trim());
      projectsStore.upsert(project);
      onJoined();
      onClose();
    } catch (joinError) {
      setError(
        apiErrorMessage(
          t,
          joinError,
          "projects.errors.joinFailed",
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className={styles.overlay}
      data-project-modal="join"
      data-closing={closing}
      onClick={() => requestClose()}
    >
      <div
        ref={panelRef}
        className={`${styles.panel} ${styles.joinPanel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-project-title"
        tabIndex={-1}
        inert={closing}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{t("projects.join.eyebrow")}</p>
            <h2 id="join-project-title">{t("projects.join.title")}</h2>
          </div>
          <button
            className={styles.closeButton}
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label={t("projects.join.close")}
          >
            <CloseIcon size={16} />
          </button>
        </header>

        <p className={styles.joinHint}>{t("projects.join.hint")}</p>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <label className={styles.field}>
            <span>{t("projects.join.code")}</span>
            <input
              ref={inputRef}
              className={`${styles.input} ${styles.codeInput}`}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError(null);
              }}
              placeholder={t("projects.join.codePlaceholder")}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              disabled={busy}
            />
          </label>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <footer className={styles.footer}>
            <button
              className={styles.secondary}
              type="button"
              onClick={requestClose}
              disabled={busy}
            >
              {t("projects.join.cancel")}
            </button>
            <button
              className={styles.primary}
              type="submit"
              disabled={busy || !code.trim()}
            >
              {busy
                ? t("projects.join.joining")
                : t("projects.join.submit")}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
