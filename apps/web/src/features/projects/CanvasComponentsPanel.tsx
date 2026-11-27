import {
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import type { ProjectType } from "../../lib/api";
import {
  getCompiledControls,
  getControlDefinitions,
  getControlStates,
  getPageSize,
  isControlDefinitionPage,
  type CanvasPage,
} from "./canvasDocument";
import {
  CONTROL_DRAG_MIME,
  getControlPreviewState,
  isControlDirty,
  type ControlTarget,
  type CreateControlInput,
} from "./canvasControls";
import { CanvasNodeView } from "./CanvasNodeView";
import styles from "./CanvasComponentsPanel.module.css";

interface CanvasComponentsPanelProps {
  pages: CanvasPage[];
  projectType: ProjectType;
  onCreateControl: (input: CreateControlInput) => void;
  onEditControl: (controlId: string) => void;
  onCompileControl: (controlId: string) => void;
  onDeleteControl: (controlId: string) => void;
  onControlDragStart: (controlId: string) => void;
  blockedControlIds?: ReadonlySet<string>;
}

const DEFAULT_WIDTH = 240;
const DEFAULT_HEIGHT = 120;
const PREVIEW_WIDTH = 104;
const PREVIEW_HEIGHT = 68;

function ControlPreview({
  pages,
  controlId,
}: {
  pages: CanvasPage[];
  controlId: string;
}) {
  const { t } = useTranslation();
  const state = getControlPreviewState(pages, controlId);
  const size = state ? getPageSize(state, pages) : null;
  const scale = size
    ? Math.min(
        1,
        PREVIEW_WIDTH / Math.max(1, size.width),
        PREVIEW_HEIGHT / Math.max(1, size.height),
      )
    : 1;

  return (
    <span className={styles.preview} aria-hidden="true">
      {state && size ? (
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
            pages={pages}
            root
            position={{ left: 0, top: 0 }}
            maxDepth={8}
          />
        </span>
      ) : (
        <span className={styles.previewEmpty}>
          {t("projects.workspace.controls.previewEmpty")}
        </span>
      )}
    </span>
  );
}

export function CanvasComponentsPanel({
  pages,
  projectType,
  onCreateControl,
  onEditControl,
  onCompileControl,
  onDeleteControl,
  onControlDragStart,
  blockedControlIds,
}: CanvasComponentsPanelProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(
    null,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState<ControlTarget>(projectType);
  const [width, setWidth] = useState(String(DEFAULT_WIDTH));
  const [height, setHeight] = useState(String(DEFAULT_HEIGHT));
  const [error, setError] = useState("");

  const controls = useMemo(() => {
    const compiled = new Set(
      getCompiledControls(pages).map((control) => control.id),
    );
    return getControlDefinitions(pages)
      .slice()
      .sort((left, right) => {
        const leftCompiled = compiled.has(left.id) ? 1 : 0;
        const rightCompiled = compiled.has(right.id) ? 1 : 0;
        if (leftCompiled !== rightCompiled) {
          return rightCompiled - leftCompiled;
        }
        return left.name.localeCompare(right.name);
      });
  }, [pages]);

  useEffect(() => {
    if (!dialogOpen) return;
    document.body.dataset.canvasModal = "true";
    return () => {
      delete document.body.dataset.canvasModal;
    };
  }, [dialogOpen]);

  const resetDialog = () => {
    setName("");
    setDescription("");
    setTarget(projectType);
    setWidth(String(DEFAULT_WIDTH));
    setHeight(String(DEFAULT_HEIGHT));
    setError("");
  };

  const openDialog = () => {
    resetDialog();
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetDialog();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const numericWidth = Number.parseFloat(width);
    const numericHeight = Number.parseFloat(height);
    if (!trimmedName) {
      setError(t("projects.workspace.controls.dialog.nameRequired"));
      return;
    }
    if (
      !Number.isFinite(numericWidth) ||
      numericWidth < 8 ||
      !Number.isFinite(numericHeight) ||
      numericHeight < 8
    ) {
      setError(t("projects.workspace.controls.dialog.sizeInvalid"));
      return;
    }

    onCreateControl({
      name: trimmedName,
      description,
      target,
      width: numericWidth,
      height: numericHeight,
    });
    closeDialog();
  };

  const handleDragStart = (
    event: ReactDragEvent<HTMLElement>,
    controlId: string,
  ) => {
    event.dataTransfer.setData(CONTROL_DRAG_MIME, controlId);
    event.dataTransfer.setData("text/plain", controlId);
    event.dataTransfer.effectAllowed = "copy";
    onControlDragStart(controlId);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span className={styles.count}>
          {t("projects.workspace.controls.count", {
            count: controls.length,
          })}
        </span>
        <button
          className={styles.createButton}
          type="button"
          onClick={openDialog}
        >
          <span aria-hidden="true">+</span>
          {t("projects.workspace.controls.create")}
        </button>
      </div>

      {controls.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyMark} aria-hidden="true">
            ◇
          </span>
          <p className={styles.emptyTitle}>
            {t("projects.workspace.controls.emptyTitle")}
          </p>
          <p className={styles.emptyHint}>
            {t("projects.workspace.controls.emptyHint")}
          </p>
        </div>
      ) : (
        <div className={styles.list} role="list">
          {controls.map((control) => {
            if (!isControlDefinitionPage(control) || !control.control) {
              return null;
            }
            const compiled = control.control.status === "compiled";
            const states = getControlStates(pages, control.id);
            const dirty = compiled && isControlDirty(pages, control.id);
            const blocked = blockedControlIds?.has(control.id) ?? false;
            const confirming = deleteConfirmId === control.id;

            return (
              <article
                key={control.id}
                className={styles.card}
                role="listitem"
                data-compiled={compiled}
                data-blocked={blocked || undefined}
                draggable={compiled && !blocked}
                onDragStart={
                  compiled && !blocked
                    ? (event) => handleDragStart(event, control.id)
                    : undefined
                }
                onDoubleClick={(event) => {
                  if (
                    event.target instanceof HTMLElement &&
                    event.target.closest("button")
                  ) {
                    return;
                  }
                  onEditControl(control.id);
                }}
              >
                <div className={styles.cover}>
                  <ControlPreview pages={pages} controlId={control.id} />
                  {compiled ? (
                    dirty ? (
                      <span className={styles.dirtyBadge}>
                        {t("projects.workspace.controls.dirty")}
                      </span>
                    ) : null
                  ) : (
                    <span className={styles.draftBadge}>
                      {t("projects.workspace.controls.uncompiled")}
                    </span>
                  )}
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.titleRow}>
                    <strong className={styles.name}>{control.name}</strong>
                    <span className={styles.stateCount}>
                      {t("projects.workspace.controls.stateCount", {
                        count: states.length,
                      })}
                    </span>
                  </div>
                  {control.control.description ? (
                    <p className={styles.description}>
                      {control.control.description}
                    </p>
                  ) : null}
                  {blocked ? (
                    <p className={styles.blockedHint}>
                      {t("projects.workspace.controls.nestingBlocked")}
                    </p>
                  ) : null}

                  {confirming ? (
                    <div className={styles.confirmRow}>
                      <span>
                        {t("projects.workspace.controls.deleteConfirm")}
                      </span>
                      <button
                        className={styles.dangerButton}
                        type="button"
                        onClick={() => {
                          setDeleteConfirmId(null);
                          onDeleteControl(control.id);
                        }}
                      >
                        {t("projects.workspace.controls.delete")}
                      </button>
                      <button
                        className={styles.ghostButton}
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                      >
                        {t("projects.workspace.controls.cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className={styles.actions}>
                      <button
                        className={styles.actionButton}
                        type="button"
                        onClick={() => onEditControl(control.id)}
                      >
                        {t("projects.workspace.controls.edit")}
                      </button>
                      <button
                        className={styles.actionButton}
                        type="button"
                        onClick={() => onCompileControl(control.id)}
                      >
                        {compiled
                          ? t("projects.workspace.controls.recompile")
                          : t("projects.workspace.controls.compile")}
                      </button>
                      <button
                        className={styles.deleteButton}
                        type="button"
                        aria-label={t("projects.workspace.controls.delete")}
                        onClick={() => setDeleteConfirmId(control.id)}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {dialogOpen
        ? createPortal(
            <div
              className={styles.dialogOverlay}
              role="presentation"
              onClick={closeDialog}
            >
              <div
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="canvas-control-dialog-title"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeDialog();
                  }
                }}
              >
                <header className={styles.dialogHeader}>
                  <div>
                    <h2 id="canvas-control-dialog-title">
                      {t("projects.workspace.controls.dialog.title")}
                    </h2>
                    <p>{t("projects.workspace.controls.dialog.hint")}</p>
                  </div>
                  <button
                    className={styles.dialogClose}
                    type="button"
                    aria-label={t("projects.workspace.controls.cancel")}
                    onClick={closeDialog}
                  >
                    ×
                  </button>
                </header>

                <form className={styles.dialogForm} onSubmit={handleSubmit}>
                  <label className={styles.field}>
                    <span>{t("projects.workspace.controls.dialog.name")}</span>
                    <input
                      className={styles.input}
                      value={name}
                      maxLength={80}
                      autoFocus
                      onChange={(event) => {
                        setName(event.target.value);
                        setError("");
                      }}
                    />
                  </label>

                  <label className={styles.field}>
                    <span>
                      {t("projects.workspace.controls.dialog.description")}
                    </span>
                    <input
                      className={styles.input}
                      value={description}
                      maxLength={500}
                      onChange={(event) =>
                        setDescription(event.target.value)
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span>{t("projects.workspace.controls.dialog.target")}</span>
                    <select
                      className={styles.select}
                      value={target}
                      onChange={(event) =>
                        setTarget(event.target.value as ControlTarget)
                      }
                    >
                      <option value="software">
                        {t("projects.workspace.controls.targets.software")}
                      </option>
                      <option value="website">
                        {t("projects.workspace.controls.targets.website")}
                      </option>
                      <option value="both">
                        {t("projects.workspace.controls.targets.both")}
                      </option>
                    </select>
                  </label>

                  <div className={styles.sizeRow}>
                    <label className={styles.field}>
                      <span>
                        {t("projects.workspace.controls.dialog.width")}
                      </span>
                      <span className={styles.inputUnit}>
                        <input
                          className={styles.input}
                          type="number"
                          min={8}
                          max={4000}
                          step={1}
                          value={width}
                          onChange={(event) => {
                            setWidth(event.target.value);
                            setError("");
                          }}
                        />
                        <span>px</span>
                      </span>
                    </label>
                    <label className={styles.field}>
                      <span>
                        {t("projects.workspace.controls.dialog.height")}
                      </span>
                      <span className={styles.inputUnit}>
                        <input
                          className={styles.input}
                          type="number"
                          min={8}
                          max={4000}
                          step={1}
                          value={height}
                          onChange={(event) => {
                            setHeight(event.target.value);
                            setError("");
                          }}
                        />
                        <span>px</span>
                      </span>
                    </label>
                  </div>

                  {error ? (
                    <p className={styles.error} role="alert">
                      {error}
                    </p>
                  ) : null}

                  <footer className={styles.dialogActions}>
                    <button
                      className={styles.ghostButton}
                      type="button"
                      onClick={closeDialog}
                    >
                      {t("projects.workspace.controls.cancel")}
                    </button>
                    <button className={styles.primaryButton} type="submit">
                      {t("projects.workspace.controls.dialog.create")}
                    </button>
                  </footer>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
