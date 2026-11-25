import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { BrandMark } from "../../components/BrandMark";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import {
  CloseIcon,
  MonitorIcon,
  GlobeIcon,
  UploadIcon,
} from "../../components/icons";
import {
  type CreateProjectInput,
  type ProjectType,
  type ProjectVisibility,
} from "../../lib/api";
import { apiErrorMessage } from "../../lib/apiErrors";
import { lockBackground } from "../../lib/backgroundLock";
import { createLoadingProgressController } from "../../lib/loading";
import { createProjectStream } from "../../lib/projectStream";
import { projectsStore } from "../../lib/projects";
import { useAnimatedClose } from "../../lib/useAnimatedClose";
import styles from "./ProjectModal.module.css";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const ICON_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const ICON_MAX_BYTES = 2 * 1024 * 1024;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("无法读取图片"));
    };
    reader.onerror = () => reject(new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
}

interface CreateProjectModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateProjectModal({
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const { t } = useTranslation();
  const { closing, beginClose } = useAnimatedClose(onClose);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [type, setType] = useState<ProjectType | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] =
    useState<ProjectVisibility>("private");
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
  const [iconName, setIconName] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [controller] = useState(() =>
    createLoadingProgressController(),
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const createLockRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    busyRef.current = creating;
  }, [creating]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const releaseBackground = lockBackground();
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => {
      panelRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      releaseBackground();
      if (trigger?.isConnected) {
        requestAnimationFrame(() => {
          if (trigger.isConnected) trigger.focus();
        });
      }
    };
  }, []);

  useEffect(() => {
    if (step === 1) nameRef.current?.focus();
  }, [step]);

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

  const resetRequestId = () => {
    requestIdRef.current = null;
  };

  const useFile = async (file: File) => {
    if (!ICON_TYPES.has(file.type)) {
      setIconError(t("projects.errors.iconType"));
      return;
    }
    if (file.size > ICON_MAX_BYTES) {
      setIconError(t("projects.errors.iconTooLarge"));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setIconDataUrl(dataUrl);
      setIconName(file.name);
      setIconError(null);
      resetRequestId();
    } catch {
      setIconError(t("projects.errors.iconReadFailed"));
    }
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void useFile(file);
  };

  const handleCreate = async () => {
    if (!type || !name.trim() || !description.trim() || createLockRef.current) {
      return;
    }

    createLockRef.current = true;
    if (!requestIdRef.current) {
      requestIdRef.current = crypto.randomUUID();
    }

    setError(null);
    setCreating(true);
    controller.reset();
    controller.start({
      progress: 0.02,
      label: t("projects.create.validating"),
    });

    const input: CreateProjectInput = {
      type,
      name: name.trim(),
      description: description.trim(),
      visibility,
      iconDataUrl,
      requestId: requestIdRef.current,
    };

    try {
      const project = await createProjectStream(input, (phase) => {
        if (!mountedRef.current) return;
        const rawProgress =
          typeof phase.progress === "number" ? phase.progress : 0;
        controller.report(
          Math.min(1, Math.max(0, rawProgress / 100)),
          {
            label: phase.message ?? t("projects.create.validating"),
          },
        );
      });

      if (!mountedRef.current) return;
      projectsStore.upsert(project);
      controller.report(1, { label: t("projects.create.complete") });
      await delay(420);
      if (!mountedRef.current) return;
      setCreating(false);
      onCreated();
      onClose();
    } catch (createError) {
      if (!mountedRef.current) return;
      createLockRef.current = false;
      setCreating(false);
      setError(
        apiErrorMessage(
          t,
          createError,
          "projects.errors.createFailed",
        ),
      );
    }
  };

  const canContinue =
    step === 0
      ? Boolean(type)
      : step === 1
        ? Boolean(name.trim() && description.trim())
        : true;

  if (creating) {
    return createPortal(
      <div className={styles.loadingHost}>
        <LoadingOverlay
          controller={controller}
          title={t("projects.create.creatingTitle")}
          description={t("projects.create.creatingDescription", {
            name: name.trim(),
          })}
          label={t("projects.create.creatingLabel")}
          progressLabel={t("projects.create.creatingTitle")}
        />
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className={styles.overlay}
      data-project-modal="create"
      data-closing={closing}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
      onClick={() => requestClose()}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        tabIndex={-1}
        inert={closing}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{t("projects.create.eyebrow")}</p>
            <h2 id="create-project-title">{t("projects.create.title")}</h2>
          </div>
          <button
            className={styles.closeButton}
            type="button"
            onClick={requestClose}
            disabled={creating}
            aria-label={t("projects.create.close")}
          >
            <CloseIcon size={16} />
          </button>
        </header>

        <div className={styles.stepDots} aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={styles.stepDot}
              data-active={step >= index}
            />
          ))}
        </div>

        <div className={styles.body}>
          {step === 0 ? (
            <section className={styles.section}>
              <h3>{t("projects.create.typeTitle")}</h3>
              <p className={styles.sectionHint}>
                {t("projects.create.typeHint")}
              </p>
              <div className={styles.typeGrid}>
                <button
                  className={styles.typeCard}
                  type="button"
                  data-selected={type === "software"}
                  onClick={() => {
                    setType("software");
                    resetRequestId();
                    setError(null);
                  }}
                >
                  <span className={styles.typeIcon}>
                    <MonitorIcon size={22} />
                  </span>
                  <strong>{t("projects.types.software")}</strong>
                  <span>{t("projects.create.softwareHint")}</span>
                </button>
                <button
                  className={styles.typeCard}
                  type="button"
                  data-selected={type === "website"}
                  onClick={() => {
                    setType("website");
                    resetRequestId();
                    setError(null);
                  }}
                >
                  <span className={styles.typeIcon}>
                    <GlobeIcon size={22} />
                  </span>
                  <strong>{t("projects.types.website")}</strong>
                  <span>{t("projects.create.websiteHint")}</span>
                </button>
              </div>
            </section>
          ) : step === 1 ? (
            <section className={styles.section}>
              <h3>{t("projects.create.detailsTitle")}</h3>
              <p className={styles.sectionHint}>
                {t("projects.create.detailsHint")}
              </p>

              <label className={styles.field}>
                <span>{t("projects.create.name")}</span>
                <input
                  ref={nameRef}
                  className={styles.input}
                  value={name}
                  maxLength={80}
                  onChange={(event) => {
                    setName(event.target.value);
                    resetRequestId();
                    setError(null);
                  }}
                  placeholder={t("projects.create.namePlaceholder")}
                />
              </label>

              <label className={styles.field}>
                <span>{t("projects.create.description")}</span>
                <textarea
                  className={styles.textarea}
                  value={description}
                  maxLength={500}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    resetRequestId();
                    setError(null);
                  }}
                  placeholder={t("projects.create.descriptionPlaceholder")}
                />
              </label>

              <fieldset className={styles.fieldset}>
                <legend>{t("projects.create.visibility")}</legend>
                <div className={styles.visibilityGrid}>
                  {(
                    ["public", "private", "shared"] as ProjectVisibility[]
                  ).map((option) => (
                    <button
                      key={option}
                      className={styles.visibilityOption}
                      type="button"
                      data-selected={visibility === option}
                      onClick={() => {
                        setVisibility(option);
                        resetRequestId();
                        setError(null);
                      }}
                    >
                      <strong>{t(`projects.visibility.${option}`)}</strong>
                      <span>
                        {t(
                          `projects.create.visibilityHints.${option}`,
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>
          ) : (
            <section className={styles.section}>
              <h3>
                {type === "website"
                  ? t("projects.create.websiteIconTitle")
                  : t("projects.create.softwareIconTitle")}
              </h3>
              <p className={styles.sectionHint}>
                {t("projects.create.iconHint")}
              </p>

              <button
                className={styles.dropzone}
                type="button"
                data-active={dragActive}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                <span className={styles.dropPreview}>
                  {iconDataUrl ? (
                    <img src={iconDataUrl} alt="" />
                  ) : (
                    <BrandMark size={42} />
                  )}
                </span>
                <span className={styles.dropCopy}>
                  <strong>
                    {dragActive
                      ? t("projects.create.dropActive")
                      : t("projects.create.dropHint")}
                  </strong>
                  <span>{t("projects.create.iconTypes")}</span>
                  {iconName ? <code>{iconName}</code> : null}
                </span>
                <span className={styles.uploadGlyph}>
                  <UploadIcon size={18} />
                </span>
              </button>
              <input
                ref={fileInputRef}
                className={styles.fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void useFile(file);
                  event.target.value = "";
                }}
              />

              <div className={styles.dropActions}>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t("projects.create.chooseFile")}
                </button>
                {iconDataUrl ? (
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={() => {
                      setIconDataUrl(null);
                      setIconName(null);
                      setIconError(null);
                      resetRequestId();
                    }}
                  >
                    {t("projects.create.removeIcon")}
                  </button>
                ) : (
                  <span>{t("projects.create.defaultIcon")}</span>
                )}
              </div>
              {iconError ? (
                <p className={styles.error} role="alert">
                  {iconError}
                </p>
              ) : null}
            </section>
          )}
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <footer className={styles.footer}>
          <div>
            {step > 0 ? (
              <button
                className={styles.secondary}
                type="button"
                onClick={() => {
                  setError(null);
                  setStep((current) => (current - 1) as 0 | 1);
                }}
              >
                {t("projects.create.back")}
              </button>
            ) : (
              <button
                className={styles.secondary}
                type="button"
                onClick={requestClose}
              >
                {t("projects.create.cancel")}
              </button>
            )}
          </div>
          <button
            className={styles.primary}
            type="button"
            disabled={!canContinue}
            onClick={() => {
              if (step === 2) {
                void handleCreate();
                return;
              }
              setError(null);
              setStep((current) => (current + 1) as 1 | 2);
            }}
          >
            {step === 2
              ? t("projects.create.submit")
              : t("projects.create.next")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
