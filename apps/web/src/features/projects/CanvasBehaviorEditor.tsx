import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import type {
  CanvasBehavior,
  CanvasBehaviorAction,
  CanvasBehaviorActionType,
  CanvasBehaviorCondition,
  CanvasBehaviorConditionOperator,
  CanvasBehaviorConditionSource,
  CanvasBehaviorTrigger,
  CanvasPage,
} from "./canvasDocument";
import {
  BEHAVIOR_ACTION_DEFINITIONS,
  BEHAVIOR_CONDITION_OPERATORS,
  BEHAVIOR_CONDITION_SOURCES,
  BEHAVIOR_STYLE_KEYS,
  behaviorActionLabelKey,
  behaviorEventLabelKey,
  collectBehaviorLint,
  createBehaviorAction,
  createBehaviorCondition,
  createBehaviorState,
  createBehaviorTrigger,
  createBehaviorVariable,
  getPageBehavior,
  getSupportedEvents,
} from "./canvasBehavior";
import styles from "./CanvasBehaviorEditor.module.css";

const LAYER_DRAG_MIME = "application/x-morfa-layer";
const ACTION_DRAG_MIME = "application/x-morfa-action";

function DraftInput({
  value,
  onCommit,
  placeholder,
  type = "text",
  ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  type?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [focused, value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <input
      className={styles.fieldInput}
      type={type}
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function SelectField({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <select
      className={styles.fieldSelect}
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

function ConditionCard({
  condition,
  ownerId,
  pages,
  variables,
  onChange,
  onRemove,
}: {
  condition: CanvasBehaviorCondition;
  ownerId: string;
  pages: CanvasPage[];
  variables: { key: string; type: string }[];
  onChange: (condition: CanvasBehaviorCondition) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const sourceDefinition =
    BEHAVIOR_CONDITION_SOURCES.find(
      (item) => item.source === condition.source,
    ) ?? BEHAVIOR_CONDITION_SOURCES[0];
  const needsTarget = sourceDefinition.needsTarget;
  const targetId = condition.targetId ?? ownerId;
  const target = pages.find((page) => page.id === targetId) ?? null;
  const targetStates = target?.behavior?.states ?? [];
  const variable = variables.find((item) => item.key === condition.key);
  const operatorOptions = BEHAVIOR_CONDITION_OPERATORS.filter((item) =>
    condition.source === "state" || condition.source === "nodeVisible"
      ? item.operator === "eq" || item.operator === "neq"
      : true,
  );

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!needsTarget) return;
    const nodeId = event.dataTransfer.getData(LAYER_DRAG_MIME);
    if (!nodeId || !pages.some((page) => page.id === nodeId)) return;
    event.preventDefault();
    event.stopPropagation();
    onChange({ ...condition, targetId: nodeId });
  };

  const replaceSource = (source: CanvasBehaviorConditionSource) => {
    const next = createBehaviorCondition(source);
    onChange({ ...next, id: condition.id, negate: condition.negate });
  };

  return (
    <div
      className={styles.conditionCard}
      data-condition-source={condition.source}
      onDragOver={(event) => {
        if (!needsTarget) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      <div className={styles.actionCardHeader}>
        <span className={styles.conditionTag}>
          {t("projects.workspace.behavior.conditionTag")}
        </span>
        <SelectField
          value={condition.source}
          ariaLabel={t("projects.workspace.behavior.fields.conditionSource")}
          onChange={(value) =>
            replaceSource(value as CanvasBehaviorConditionSource)
          }
        >
          {BEHAVIOR_CONDITION_SOURCES.map((item) => (
            <option value={item.source} key={item.source}>
              {t(item.labelKey)}
            </option>
          ))}
        </SelectField>
        <label className={styles.negateLabel}>
          <input
            type="checkbox"
            checked={Boolean(condition.negate)}
            onChange={(event) =>
              onChange({ ...condition, negate: event.target.checked || undefined })
            }
          />
          {t("projects.workspace.behavior.fields.negate")}
        </label>
        <button
          className={styles.iconButton}
          type="button"
          aria-label={t("projects.workspace.behavior.removeCondition")}
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      <div className={styles.actionFields}>
        {condition.source === "variable" ||
        condition.source === "nodeStyle" ? (
          <label className={styles.fieldRow}>
            <span>
              {condition.source === "nodeStyle"
                ? t("projects.workspace.behavior.fields.styleKey")
                : t("projects.workspace.behavior.fields.variable")}
            </span>
            <select
              className={styles.fieldSelect}
              value={condition.key ?? ""}
              onChange={(event) =>
                onChange({
                  ...condition,
                  key: event.target.value || undefined,
                })
              }
            >
              <option value="">
                {condition.source === "nodeStyle"
                  ? t("projects.workspace.behavior.chooseStyleKey")
                  : t("projects.workspace.behavior.chooseVariable")}
              </option>
              {condition.source === "nodeStyle"
                ? BEHAVIOR_STYLE_KEYS.map((key) => (
                    <option value={key} key={key}>
                      {key}
                    </option>
                  ))
                : variables.map((item) => (
                    <option value={item.key} key={item.key}>
                      {item.key} ({item.type})
                    </option>
                  ))}
            </select>
          </label>
        ) : null}

        {needsTarget ? (
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.targetNode")}</span>
            <select
              className={styles.fieldSelect}
              value={condition.targetId ?? ""}
              onChange={(event) =>
                onChange({
                  ...condition,
                  targetId: event.target.value || undefined,
                  ...(condition.source === "state"
                    ? { value: "" }
                    : {}),
                })
              }
            >
              <option value="">
                {t("projects.workspace.behavior.fields.ownerNode")}
              </option>
              {pages.map((page) => (
                <option value={page.id} key={page.id}>
                  {page.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className={styles.fieldRow}>
          <span>{t("projects.workspace.behavior.fields.operator")}</span>
          <select
            className={styles.fieldSelect}
            value={condition.operator}
            onChange={(event) =>
              onChange({
                ...condition,
                operator: event.target
                  .value as CanvasBehaviorConditionOperator,
              })
            }
          >
            {operatorOptions.map((item) => (
              <option value={item.operator} key={item.operator}>
                {item.symbol}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.fieldRow}>
          <span>{t("projects.workspace.behavior.fields.compareValue")}</span>
          {condition.source === "state" ? (
            <select
              className={styles.fieldSelect}
              value={condition.value}
              onChange={(event) =>
                onChange({ ...condition, value: event.target.value })
              }
            >
              <option value="">
                {t("projects.workspace.behavior.chooseState")}
              </option>
              {targetStates.map((state) => (
                <option value={state.id} key={state.id}>
                  {state.name}
                </option>
              ))}
            </select>
          ) : condition.source === "nodeVisible" ||
            variable?.type === "boolean" ? (
            <select
              className={styles.fieldSelect}
              value={condition.value}
              onChange={(event) =>
                onChange({ ...condition, value: event.target.value })
              }
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              className={styles.fieldInput}
              value={condition.value}
              onChange={(event) =>
                onChange({ ...condition, value: event.target.value })
              }
            />
          )}
        </label>

        {needsTarget ? (
          <p className={styles.dropHint}>
            {t("projects.workspace.behavior.dropConditionHint")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ActionCard({
  action,
  pages,
  behavior,
  onChange,
  onRemove,
}: {
  action: CanvasBehaviorAction;
  pages: CanvasPage[];
  behavior: CanvasBehavior;
  onChange: (patch: Partial<CanvasBehaviorAction>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const definition = BEHAVIOR_ACTION_DEFINITIONS.find(
    (item) => item.type === action.type,
  );
  const needsTarget = definition?.needsTarget ?? false;
  const needsValue = definition?.needsValue ?? false;

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!needsTarget) return;
    const nodeId = event.dataTransfer.getData(LAYER_DRAG_MIME);
    if (!nodeId || !pages.some((page) => page.id === nodeId)) return;
    event.preventDefault();
    event.stopPropagation();
    onChange({ targetId: nodeId });
  };

  return (
    <div
      className={styles.actionCard}
      data-action-type={action.type}
      onDragOver={(event) => {
        if (!needsTarget) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      <div className={styles.actionCardHeader}>
        <span className={styles.actionTag}>
          {t("projects.workspace.behavior.actionTag")}
        </span>
        <span className={styles.actionName}>
          {t(behaviorActionLabelKey(action.type))}
        </span>
        <button
          className={styles.iconButton}
          type="button"
          aria-label={t("projects.workspace.behavior.removeAction")}
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      <div className={styles.actionFields}>
        {action.type === "navigate" ? (
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.targetPage")}</span>
            <select
              className={styles.fieldSelect}
              value={action.pageId ?? ""}
              onChange={(event) =>
                onChange({ pageId: event.target.value || undefined })
              }
            >
              <option value="">
                {t("projects.workspace.behavior.fields.choosePage")}
              </option>
              {pages.map((page) => (
                <option value={page.id} key={page.id}>
                  {page.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {needsTarget ? (
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.targetNode")}</span>
            <select
              className={styles.fieldSelect}
              value={action.targetId ?? ""}
              onChange={(event) =>
                onChange({ targetId: event.target.value || undefined })
              }
            >
              <option value="">
                {t("projects.workspace.behavior.fields.chooseNode")}
              </option>
              {pages.map((page) => (
                <option value={page.id} key={page.id}>
                  {page.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {action.type === "setStyle" ? (
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.styleKey")}</span>
            <SelectField
              value={action.key ?? "background-color"}
              onChange={(value) => onChange({ key: value })}
            >
              {BEHAVIOR_STYLE_KEYS.map((key) => (
                <option value={key} key={key}>
                  {key}
                </option>
              ))}
            </SelectField>
          </label>
        ) : null}

        {action.type === "setState" ? (
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.state")}</span>
            <SelectField
              value={action.value ?? ""}
              onChange={(value) => onChange({ value })}
            >
              <option value="">
                {t("projects.workspace.behavior.fields.chooseState")}
              </option>
              {behavior.states.map((state) => (
                <option value={state.id} key={state.id}>
                  {state.name}
                </option>
              ))}
            </SelectField>
          </label>
        ) : null}

        {action.type === "setVariable" ||
        action.type === "incrementVariable" ||
        action.type === "toggleVariable" ? (
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.variable")}</span>
            <SelectField
              value={action.key ?? ""}
              onChange={(value) => onChange({ key: value })}
            >
              <option value="">
                {t("projects.workspace.behavior.fields.chooseVariable")}
              </option>
              {behavior.variables.map((variable) => (
                <option value={variable.key} key={variable.key}>
                  {variable.key}
                </option>
              ))}
            </SelectField>
          </label>
        ) : null}

        {needsValue && action.type !== "setState" ? (
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.value")}</span>
            <DraftInput
              value={action.value ?? ""}
              ariaLabel={t("projects.workspace.behavior.fields.value")}
              onCommit={(value) => onChange({ value })}
            />
          </label>
        ) : null}

        {needsTarget ? (
          <p className={styles.dropHint}>
            {t("projects.workspace.behavior.dropNodeHint")}
          </p>
        ) : null}
      </div>

      <div className={styles.actionArrow} aria-hidden="true" />
    </div>
  );
}

export function CanvasBehaviorEditor({
  pages,
  pageId,
  height,
  onHeightChange,
  onClose,
  onUpdateBehavior,
}: {
  pages: CanvasPage[];
  pageId: string | null;
  height: number;
  onHeightChange: (height: number) => void;
  onClose: () => void;
  onUpdateBehavior: (pageId: string, behavior: CanvasBehavior) => void;
}) {
  const { t } = useTranslation();
  const page = pages.find((item) => item.id === pageId) ?? null;
  const behavior = page ? getPageBehavior(page) : null;
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(
    null,
  );
  const [newStateName, setNewStateName] = useState("");
  const [newVariableKey, setNewVariableKey] = useState("");
  const [newVariableType, setNewVariableType] =
    useState<"text" | "number" | "boolean" | "color">("text");
  const lintItems = useMemo(() => collectBehaviorLint(pages), [pages]);
  const currentLint = page
    ? lintItems.filter((item) => item.pageId === page.id)
    : [];
  const selectedTrigger =
    behavior?.triggers.find((item) => item.id === selectedTriggerId) ??
    null;
  const supportedEvents = page
    ? getSupportedEvents(page)
    : ["click", "load"];
  const allVariables = useMemo(() => {
    const map = new Map<string, { key: string; type: string }>();
    for (const item of pages) {
      for (const variable of item.behavior?.variables ?? []) {
        if (!map.has(variable.key)) {
          map.set(variable.key, {
            key: variable.key,
            type: variable.type,
          });
        }
      }
    }
    return [...map.values()];
  }, [pages]);
  const stateGraph = useMemo(() => {
    if (!behavior || behavior.states.length === 0) return null;
    const initialId =
      behavior.states.find((state) => state.initial)?.id ??
      behavior.states[0].id;
    const edges: {
      id: string;
      triggerId: string;
      sourceIndex: number;
      targetIndex: number;
      label: string;
    }[] = [];

    behavior.triggers.forEach((trigger) => {
      const sourceId = trigger.stateId ?? initialId;
      const sourceIndex = behavior.states.findIndex(
        (state) => state.id === sourceId,
      );
      if (sourceIndex < 0) return;
      trigger.actions.forEach((action) => {
        if (action.type !== "setState" || !action.value) return;
        const targetIndex = behavior.states.findIndex(
          (state) => state.id === action.value,
        );
        if (targetIndex < 0) return;
        edges.push({
          id: `${trigger.id}:${action.id}`,
          triggerId: trigger.id,
          sourceIndex,
          targetIndex,
          label: t(behaviorEventLabelKey(trigger.event)),
        });
      });
    });

    return {
      initialId,
      states: behavior.states,
      edges,
    };
  }, [behavior, t]);
  const stateMapRef = useRef<HTMLElement | null>(null);
  const [stateMapWidth, setStateMapWidth] = useState(640);

  useEffect(() => {
    const element = stateMapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setStateMapWidth(Math.max(320, width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [stateGraph]);

  const graphPadding = Math.min(60, Math.max(24, stateMapWidth * 0.06));
  const graphStateCount = stateGraph?.states.length ?? 1;
  const graphNodeWidth = Math.min(
    92,
    Math.max(
      44,
      ((stateMapWidth - graphPadding * 2) /
        Math.max(1, graphStateCount)) *
        0.62,
    ),
  );
  const stateNodeX = (index: number) => {
    if (graphStateCount <= 1) return stateMapWidth / 2;
    return (
      graphPadding +
      (index * (stateMapWidth - graphPadding * 2)) /
        (graphStateCount - 1)
    );
  };

  const resizeRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);

  const updateBehavior = (next: CanvasBehavior) => {
    if (page) onUpdateBehavior(page.id, next);
  };

  const updateTrigger = (
    triggerId: string,
    update: (trigger: CanvasBehaviorTrigger) => CanvasBehaviorTrigger,
  ) => {
    if (!behavior) return;
    updateBehavior({
      ...behavior,
      triggers: behavior.triggers.map((trigger) =>
        trigger.id === triggerId ? update(trigger) : trigger,
      ),
    });
  };

  const addTrigger = (event: string) => {
    if (!behavior) return;
    const trigger = createBehaviorTrigger(event);
    updateBehavior({
      ...behavior,
      triggers: [...behavior.triggers, trigger],
    });
    setSelectedTriggerId(trigger.id);
  };

  const addActionToTrigger = (
    triggerId: string,
    type: CanvasBehaviorActionType,
  ) => {
    if (!behavior) return;
    const action = createBehaviorAction(type);
    updateTrigger(triggerId, (trigger) => ({
      ...trigger,
      actions: [...trigger.actions, action],
    }));
    setSelectedTriggerId(triggerId);
  };

  const addAction = (type: CanvasBehaviorActionType) => {
    if (!selectedTrigger) return;
    addActionToTrigger(selectedTrigger.id, type);
  };

  const readDraggedAction = (event: ReactDragEvent<HTMLElement>) => {
    const type = event.dataTransfer.getData(ACTION_DRAG_MIME);
    const definition = BEHAVIOR_ACTION_DEFINITIONS.find(
      (item) => item.type === type,
    );
    return definition?.type ?? null;
  };

  const addCondition = (source: CanvasBehaviorConditionSource) => {
    if (!behavior || !selectedTrigger) return;
    const condition = createBehaviorCondition(source);
    if (condition.source !== "variable") {
      condition.targetId = page?.id;
    }
    updateTrigger(selectedTrigger.id, (trigger) => ({
      ...trigger,
      conditionMode: trigger.conditionMode ?? "all",
      conditions: [...(trigger.conditions ?? []), condition],
    }));
  };

  const updateCondition = (
    triggerId: string,
    conditionId: string,
    nextCondition: CanvasBehaviorCondition,
  ) => {
    updateTrigger(triggerId, (trigger) => ({
      ...trigger,
      conditions: (trigger.conditions ?? []).map((condition) =>
        condition.id === conditionId ? nextCondition : condition,
      ),
    }));
  };

  const removeCondition = (triggerId: string, conditionId: string) => {
    updateTrigger(triggerId, (trigger) => {
      const nextConditions = (trigger.conditions ?? []).filter(
        (condition) => condition.id !== conditionId,
      );
      return {
        ...trigger,
        ...(nextConditions.length
          ? { conditions: nextConditions }
          : { conditions: undefined, conditionMode: undefined }),
      };
    });
  };

  const removeTrigger = (triggerId: string) => {
    if (!behavior) return;
    updateBehavior({
      ...behavior,
      triggers: behavior.triggers.filter(
        (trigger) => trigger.id !== triggerId,
      ),
    });
    if (selectedTriggerId === triggerId) setSelectedTriggerId(null);
  };

  const addState = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!behavior) return;
    const name = newStateName.trim();
    if (!name) return;
    updateBehavior({
      ...behavior,
      states: [...behavior.states, createBehaviorState(name)],
    });
    setNewStateName("");
  };

  const addVariable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!behavior) return;
    const key = newVariableKey.trim();
    if (!key || behavior.variables.some((item) => item.key === key)) return;
    updateBehavior({
      ...behavior,
      variables: [
        ...behavior.variables,
        { ...createBehaviorVariable(key), type: newVariableType },
      ],
    });
    setNewVariableKey("");
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
    };
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const maxHeight = Math.max(160, window.innerHeight * 0.7);
    onHeightChange(
      Math.min(
        maxHeight,
        Math.max(160, resize.startHeight + resize.startY - event.clientY),
      ),
    );
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <section
      className={styles.panel}
      style={{ height }}
      aria-label={t("projects.workspace.behavior.title")}
    >
      <div
        className={styles.resizeHandle}
        role="separator"
        aria-orientation="horizontal"
        onPointerDown={startResize}
        onPointerMove={handleResizeMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={endResize}
      />
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <span>{t("projects.workspace.behavior.title")}</span>
          <span className={styles.headerPageName}>
            {page ? page.name : t("projects.workspace.behavior.noSelection")}
          </span>
        </div>
        <button
          className={styles.closeButton}
          type="button"
          aria-label={t("projects.workspace.behavior.close")}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {!page || !behavior ? (
        <div className={styles.emptyState}>
          {t("projects.workspace.behavior.noSelection")}
        </div>
      ) : (
        <div className={styles.body}>
          <aside className={styles.leftPanel}>
            <section className={styles.panelSection}>
              <h3 className={styles.sectionTitle}>
                {t("projects.workspace.behavior.lintTitle")}
                <span className={styles.countBadge}>
                  {currentLint.length}
                </span>
              </h3>
              {currentLint.length ? (
                <div className={styles.lintList}>
                  {currentLint.map((item) => (
                    <button
                      className={styles.lintItem}
                      type="button"
                      key={item.id}
                      data-severity={item.severity}
                      onClick={() => {
                        if (item.triggerId) {
                          setSelectedTriggerId(item.triggerId);
                        }
                      }}
                    >
                      <span className={styles.lintMark}>
                        {item.severity === "error" ? "×" : "!"}
                      </span>
                      <span>
                        {t(
                          item.messageKey,
                          item.params as Record<string, string>,
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.mutedText}>
                  {t("projects.workspace.behavior.lintClean")}
                </p>
              )}
            </section>

            <section className={styles.panelSection}>
              <h3 className={styles.sectionTitle}>
                {t("projects.workspace.behavior.states")}
              </h3>
              <div className={styles.list}>
                {behavior.states.map((state) => (
                  <div className={styles.listRow} key={state.id}>
                    <input
                      className={styles.radio}
                      type="radio"
                      name="behavior-initial-state"
                      checked={Boolean(state.initial)}
                      aria-label={t(
                        "projects.workspace.behavior.setInitialState",
                      )}
                      onChange={() =>
                        updateBehavior({
                          ...behavior,
                          states: behavior.states.map((item) => ({
                            ...item,
                            initial: item.id === state.id,
                          })),
                        })
                      }
                    />
                    <DraftInput
                      value={state.name}
                      ariaLabel={t(
                        "projects.workspace.behavior.stateName",
                      )}
                      onCommit={(name) =>
                        updateBehavior({
                          ...behavior,
                          states: behavior.states.map((item) =>
                            item.id === state.id ? { ...item, name } : item,
                          ),
                        })
                      }
                    />
                    {behavior.states.length > 1 ? (
                      <button
                        className={styles.iconButton}
                        type="button"
                        aria-label={t(
                          "projects.workspace.behavior.removeState",
                        )}
                        onClick={() =>
                          updateBehavior({
                            ...behavior,
                            states: behavior.states.filter(
                              (item) => item.id !== state.id,
                            ),
                          })
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <form className={styles.addRow} onSubmit={addState}>
                <input
                  className={styles.fieldInput}
                  value={newStateName}
                  placeholder={t(
                    "projects.workspace.behavior.stateNamePlaceholder",
                  )}
                  onChange={(event) => setNewStateName(event.target.value)}
                />
                <button className={styles.addButton} type="submit">
                  +
                </button>
              </form>
            </section>

            <section className={styles.panelSection}>
              <h3 className={styles.sectionTitle}>
                {t("projects.workspace.behavior.variables")}
              </h3>
              <div className={styles.list}>
                {behavior.variables.map((variable) => (
                  <div className={styles.variableRow} key={variable.key}>
                    <code className={styles.variableKey}>
                      {variable.key}
                    </code>
                    <select
                      className={styles.fieldSelect}
                      value={variable.type}
                      onChange={(event) =>
                        updateBehavior({
                          ...behavior,
                          variables: behavior.variables.map((item) =>
                            item.key === variable.key
                              ? {
                                  ...item,
                                  type: event.target.value as
                                    | "text"
                                    | "number"
                                    | "boolean"
                                    | "color",
                                }
                              : item,
                          ),
                        })
                      }
                    >
                      <option value="text">text</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="color">color</option>
                    </select>
                    <DraftInput
                      value={variable.initialValue}
                      ariaLabel={t(
                        "projects.workspace.behavior.initialValue",
                      )}
                      onCommit={(initialValue) =>
                        updateBehavior({
                          ...behavior,
                          variables: behavior.variables.map((item) =>
                            item.key === variable.key
                              ? { ...item, initialValue }
                              : item,
                          ),
                        })
                      }
                    />
                    <button
                      className={styles.iconButton}
                      type="button"
                      aria-label={t(
                        "projects.workspace.behavior.removeVariable",
                      )}
                      onClick={() =>
                        updateBehavior({
                          ...behavior,
                          variables: behavior.variables.filter(
                            (item) => item.key !== variable.key,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <form className={styles.addRow} onSubmit={addVariable}>
                <input
                  className={styles.fieldInput}
                  value={newVariableKey}
                  placeholder={t(
                    "projects.workspace.behavior.variablePlaceholder",
                  )}
                  onChange={(event) => setNewVariableKey(event.target.value)}
                />
                <select
                  className={styles.fieldSelect}
                  value={newVariableType}
                  onChange={(event) =>
                    setNewVariableType(
                      event.target.value as
                        | "text"
                        | "number"
                        | "boolean"
                        | "color",
                    )
                  }
                >
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="color">color</option>
                </select>
                <button className={styles.addButton} type="submit">
                  +
                </button>
              </form>
            </section>
          </aside>

          <main className={styles.graph}>
            {stateGraph ? (
              <section
                ref={stateMapRef}
                className={styles.stateMap}
                aria-label={t(
                  "projects.workspace.behavior.stateMapTitle",
                )}
              >
                <div className={styles.stateMapHeader}>
                  <span>
                    {t("projects.workspace.behavior.stateMapTitle")}
                  </span>
                  <span className={styles.countBadge}>
                    {stateGraph.edges.length}
                  </span>
                </div>
                <svg
                  className={styles.stateMapCanvas}
                  viewBox={`0 0 ${stateMapWidth} 82`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={t(
                    "projects.workspace.behavior.stateMapTitle",
                  )}
                >
                  <defs>
                    <marker
                      id="morfa-behavior-arrow"
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="10"
                      markerHeight="10"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" />
                    </marker>
                  </defs>
                  {stateGraph.edges.map((edge) => {
                    const sourceX = stateNodeX(edge.sourceIndex);
                    const targetX = stateNodeX(edge.targetIndex);
                    const path =
                      edge.sourceIndex === edge.targetIndex
                        ? `M ${sourceX - 24} 43 C ${sourceX - 48} 2, ${sourceX + 48} 2, ${sourceX + 24} 43`
                        : `M ${sourceX} 43 C ${(sourceX + targetX) / 2} 8, ${(sourceX + targetX) / 2} 8, ${targetX} 43`;
                    const labelX = (sourceX + targetX) / 2;
                    return (
                      <g
                        className={styles.stateEdge}
                        key={edge.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${edge.label} → ${stateGraph.states[edge.targetIndex]?.name ?? ""}`}
                        onClick={() =>
                          setSelectedTriggerId(edge.triggerId)
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" ||
                            event.key === " "
                          ) {
                            event.preventDefault();
                            setSelectedTriggerId(edge.triggerId);
                          }
                        }}
                      >
                        <path
                          d={path}
                          markerEnd="url(#morfa-behavior-arrow)"
                        />
                        <text
                          x={labelX}
                          y={edge.sourceIndex === edge.targetIndex ? 14 : 20}
                          textAnchor="middle"
                        >
                          {edge.label.length > 14
                            ? `${edge.label.slice(0, 14)}…`
                            : edge.label}
                        </text>
                      </g>
                    );
                  })}
                  {stateGraph.states.map((state, index) => {
                    const x = stateNodeX(index);
                    const relatedTrigger =
                      behavior.triggers.find(
                        (trigger) => trigger.stateId === state.id,
                      ) ??
                      (state.id === stateGraph.initialId
                        ? behavior.triggers.find(
                            (trigger) => !trigger.stateId,
                          )
                        : undefined);
                    return (
                      <g
                        className={styles.stateNode}
                        data-initial={
                          state.id === stateGraph.initialId
                            ? "true"
                            : undefined
                        }
                        key={state.id}
                        role="button"
                        tabIndex={0}
                        aria-label={state.name}
                        onClick={() => {
                          if (relatedTrigger) {
                            setSelectedTriggerId(relatedTrigger.id);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (
                            (event.key === "Enter" ||
                              event.key === " ") &&
                            relatedTrigger
                          ) {
                            event.preventDefault();
                            setSelectedTriggerId(relatedTrigger.id);
                          }
                        }}
                      >
                        <rect
                          x={x - graphNodeWidth / 2}
                          y={43}
                          width={graphNodeWidth}
                          height={26}
                          rx={6}
                        />
                        <text x={x} y={59.5} textAnchor="middle">
                          {state.name.length > 10
                            ? `${state.name.slice(0, 10)}…`
                            : state.name}
                        </text>
                        {state.id === stateGraph.initialId ? (
                          <circle
                            cx={x - graphNodeWidth / 2 + 9}
                            cy={48}
                            r={3}
                          />
                        ) : null}
                      </g>
                    );
                  })}
                </svg>
                <p className={styles.stateMapHint}>
                  {stateGraph.edges.length
                    ? t("projects.workspace.behavior.stateMapHint")
                    : t("projects.workspace.behavior.stateMapEmpty")}
                </p>
              </section>
            ) : null}
            {behavior.triggers.length === 0 ? (
              <div className={styles.graphEmpty}>
                {t("projects.workspace.behavior.emptyHint")}
              </div>
            ) : (
              behavior.triggers.map((trigger) => {
                const triggerSelected = selectedTriggerId === trigger.id;
                return (
                  <div
                    className={styles.flow}
                    data-selected={triggerSelected}
                    key={trigger.id}
                    onClick={() => setSelectedTriggerId(trigger.id)}
                  >
                    <div className={styles.flowHeader}>
                      <div className={styles.eventCard}>
                        <span className={styles.eventTag}>
                          {t("projects.workspace.behavior.eventTag")}
                        </span>
                        <span className={styles.eventName}>
                          {t(behaviorEventLabelKey(trigger.event))}
                        </span>
                        <span className={styles.eventOwner}>
                          {page.name}
                        </span>
                      </div>
                      <div className={styles.flowMeta}>
                        <SelectField
                          value={trigger.stateId ?? ""}
                          ariaLabel={t(
                            "projects.workspace.behavior.fields.state",
                          )}
                          onChange={(value) =>
                            updateTrigger(trigger.id, (item) => ({
                              ...item,
                              stateId: value || undefined,
                            }))
                          }
                        >
                          <option value="">
                            {t("projects.workspace.behavior.anyState")}
                          </option>
                          {behavior.states.map((state) => (
                            <option value={state.id} key={state.id}>
                              {state.name}
                            </option>
                          ))}
                        </SelectField>
                        <button
                          className={styles.iconButton}
                          type="button"
                          aria-label={t(
                            "projects.workspace.behavior.removeTrigger",
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeTrigger(trigger.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    <div className={styles.conditions}>
                      <div className={styles.conditionsHeader}>
                        <span className={styles.conditionSectionTitle}>
                          {t("projects.workspace.behavior.conditionsTitle")}
                        </span>
                        <SelectField
                          value={trigger.conditionMode ?? "all"}
                          ariaLabel={t(
                            "projects.workspace.behavior.fields.conditionMode",
                          )}
                          onChange={(value) =>
                            updateTrigger(trigger.id, (item) => ({
                              ...item,
                              conditionMode:
                                value as "all" | "any",
                            }))
                          }
                        >
                          <option value="all">
                            {t(
                              "projects.workspace.behavior.conditionModeAll",
                            )}
                          </option>
                          <option value="any">
                            {t(
                              "projects.workspace.behavior.conditionModeAny",
                            )}
                          </option>
                        </SelectField>
                        <button
                          className={styles.addConditionButton}
                          type="button"
                          onClick={() => {
                            setSelectedTriggerId(trigger.id);
                            const condition =
                              createBehaviorCondition("variable");
                            updateTrigger(trigger.id, (item) => ({
                              ...item,
                              conditionMode:
                                item.conditionMode ?? "all",
                              conditions: [
                                ...(item.conditions ?? []),
                                condition,
                              ],
                            }));
                          }}
                        >
                          +
                        </button>
                      </div>

                      {(trigger.conditions ?? []).length ? (
                        (trigger.conditions ?? []).map((condition) => (
                          <ConditionCard
                            key={condition.id}
                            condition={condition}
                            ownerId={page.id}
                            pages={pages}
                            variables={allVariables}
                            onChange={(next) =>
                              updateCondition(
                                trigger.id,
                                condition.id,
                                next,
                              )
                            }
                            onRemove={() =>
                              removeCondition(trigger.id, condition.id)
                            }
                          />
                        ))
                      ) : (
                        <p className={styles.conditionsHint}>
                          {t(
                            "projects.workspace.behavior.conditionsEmpty",
                          )}
                        </p>
                      )}
                    </div>

                    <div
                      className={styles.actions}
                      onDragOver={(event) => {
                        if (
                          !event.dataTransfer.types.includes(
                            ACTION_DRAG_MIME,
                          )
                        ) {
                          return;
                        }
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                      }}
                      onDrop={(event) => {
                        const type = readDraggedAction(event);
                        if (!type) return;
                        event.preventDefault();
                        event.stopPropagation();
                        addActionToTrigger(trigger.id, type);
                      }}
                    >
                      {trigger.actions.length === 0 ? (
                        <button
                          className={styles.addActionPlaceholder}
                          type="button"
                          onClick={() => {
                            setSelectedTriggerId(trigger.id);
                            addAction("navigate");
                          }}
                        >
                          {t("projects.workspace.behavior.addFirstAction")}
                        </button>
                      ) : (
                        trigger.actions.map((action) => (
                          <ActionCard
                            key={action.id}
                            action={action}
                            pages={pages}
                            behavior={behavior}
                            onChange={(patch) =>
                              updateTrigger(trigger.id, (item) => ({
                                ...item,
                                actions: item.actions.map((actionItem) =>
                                  actionItem.id === action.id
                                    ? { ...actionItem, ...patch }
                                    : actionItem,
                                ),
                              }))
                            }
                            onRemove={() =>
                              updateTrigger(trigger.id, (item) => ({
                                ...item,
                                actions: item.actions.filter(
                                  (actionItem) =>
                                    actionItem.id !== action.id,
                                ),
                              }))
                            }
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </main>

          <aside className={styles.rightPanel}>
            <section className={styles.panelSection}>
              <h3 className={styles.sectionTitle}>
                {t("projects.workspace.behavior.eventsTitle")}
              </h3>
              <div className={styles.palette}>
                {supportedEvents.map((event) => (
                  <button
                    className={styles.paletteButton}
                    type="button"
                    key={event}
                    onClick={() => addTrigger(event)}
                  >
                    <span className={styles.paletteMark}>+</span>
                    {t(behaviorEventLabelKey(event))}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.panelSection}>
              <h3 className={styles.sectionTitle}>
                {t("projects.workspace.behavior.conditionsTitle")}
              </h3>
              <p className={styles.mutedText}>
                {selectedTrigger
                  ? t("projects.workspace.behavior.conditionHint")
                  : t("projects.workspace.behavior.selectTriggerHint")}
              </p>
              <div className={styles.palette}>
                {BEHAVIOR_CONDITION_SOURCES.map((definition) => (
                  <button
                    className={styles.paletteButton}
                    type="button"
                    key={definition.source}
                    disabled={!selectedTrigger}
                    onClick={() => addCondition(definition.source)}
                  >
                    <span className={styles.paletteMark}>+</span>
                    {t(definition.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.panelSection}>
              <h3 className={styles.sectionTitle}>
                {t("projects.workspace.behavior.actionsTitle")}
              </h3>
              <p className={styles.mutedText}>
                {selectedTrigger
                  ? t("projects.workspace.behavior.actionHint", {
                      event: t(
                        behaviorEventLabelKey(selectedTrigger.event),
                      ),
                    })
                  : t("projects.workspace.behavior.selectTriggerHint")}
              </p>
              <div className={styles.palette}>
                {BEHAVIOR_ACTION_DEFINITIONS.map((definition) => (
                  <button
                    className={styles.paletteButton}
                    type="button"
                    key={definition.type}
                    disabled={!selectedTrigger}
                    draggable={Boolean(selectedTrigger)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        ACTION_DRAG_MIME,
                        definition.type,
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addAction(definition.type)}
                  >
                    <span className={styles.paletteMark}>+</span>
                    {t(definition.labelKey)}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
