import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CanvasPage } from "./canvasDocument";
import styles from "./CanvasControlToolbar.module.css";

interface CanvasControlToolbarProps {
  control: CanvasPage;
  states: CanvasPage[];
  activeStateId: string | null;
  dirty: boolean;
  onSelectState: (stateId: string) => void;
  onAddState: () => void;
  onSetDefaultState: (stateId: string) => void;
  onCompile: () => void;
  onExit: () => void;
  onOpenBehavior: () => void;
  onRenameControl: (name: string) => void;
}

export function CanvasControlToolbar({
  control,
  states,
  activeStateId,
  dirty,
  onSelectState,
  onAddState,
  onSetDefaultState,
  onCompile,
  onExit,
  onOpenBehavior,
  onRenameControl,
}: CanvasControlToolbarProps) {
  const { t } = useTranslation();
  const [renameDraft, setRenameDraft] = useState(control.name);
  const focusedRef = useRef(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setRenameDraft(control.name);
  }, [control.name]);

  const commitName = () => {
    focusedRef.current = false;
    if (cancelRef.current) {
      cancelRef.current = false;
      setRenameDraft(control.name);
      return;
    }
    const name = renameDraft.trim();
    if (name && name !== control.name) onRenameControl(name);
    else setRenameDraft(control.name);
  };

  const defaultStateId = control.control?.defaultStateId ?? null;
  const compiled = control.control?.status === "compiled";

  return (
    <div
      className={styles.toolbar}
      data-control-toolbar="true"
      aria-label={t("projects.workspace.controls.editorLabel")}
    >
      <div className={styles.identity}>
        <span className={styles.kindBadge}>
          {t("projects.workspace.controls.controlBadge")}
        </span>
        <input
          className={styles.nameInput}
          value={renameDraft}
          maxLength={80}
          spellCheck={false}
          aria-label={t("projects.workspace.controls.controlName")}
          onFocus={(event) => {
            focusedRef.current = true;
            cancelRef.current = false;
            event.currentTarget.select();
          }}
          onChange={(event) => setRenameDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancelRef.current = true;
              event.currentTarget.blur();
            }
          }}
        />
        {dirty ? (
          <span className={styles.dirtyBadge}>
            {t("projects.workspace.controls.dirty")}
          </span>
        ) : null}
      </div>

      <div className={styles.states}>
        {states.map((state) => {
          const isDefault = state.id === defaultStateId;
          const active = state.id === activeStateId;
          return (
            <button
              key={state.id}
              className={styles.stateTab}
              type="button"
              data-active={active}
              aria-pressed={active}
              onClick={() => onSelectState(state.id)}
              title={
                isDefault
                  ? t("projects.workspace.controls.defaultStateHint")
                  : undefined
              }
            >
              <span className={styles.stateName}>{state.name}</span>
              {isDefault ? (
                <span className={styles.defaultMark}>
                  {t("projects.workspace.controls.defaultMark")}
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          className={styles.addStateButton}
          type="button"
          onClick={onAddState}
        >
          <span aria-hidden="true">+</span>
          {t("projects.workspace.controls.addState")}
        </button>
      </div>

      <div className={styles.actions}>
        {activeStateId && activeStateId !== defaultStateId ? (
          <button
            className={styles.ghostButton}
            type="button"
            onClick={() => onSetDefaultState(activeStateId)}
          >
            {t("projects.workspace.controls.setDefault")}
          </button>
        ) : null}
        <button
          className={styles.ghostButton}
          type="button"
          onClick={onOpenBehavior}
        >
          {t("projects.workspace.controls.rootBehavior")}
        </button>
        <button
          className={styles.compileButton}
          type="button"
          onClick={onCompile}
        >
          {compiled
            ? t("projects.workspace.controls.recompile")
            : t("projects.workspace.controls.compile")}
        </button>
        <button
          className={styles.exitButton}
          type="button"
          onClick={onExit}
        >
          {t("projects.workspace.controls.exitEditor")}
        </button>
      </div>
    </div>
  );
}
