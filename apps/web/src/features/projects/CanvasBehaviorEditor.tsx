import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import type {
  CanvasBehavior,
  CanvasBehaviorAction,
  CanvasBehaviorActionType,
  CanvasBehaviorBlock,
  CanvasBehaviorCondition,
  CanvasBehaviorConditionOperator,
  CanvasBehaviorConditionSource,
  CanvasBehaviorEdge,
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
  createBehaviorBlock,
  createBehaviorCondition,
  createBehaviorEdge,
  getPageBehavior,
  getSupportedEvents,
  materializeBehaviorGraph,
} from "./canvasBehavior";
import {
  BEHAVIOR_GRAPH_NODE_WIDTH,
  BehaviorGraphCanvas,
  type BehaviorGraphCanvasApi,
} from "./BehaviorGraphCanvas";
import styles from "./CanvasBehaviorEditor.module.css";

const LAYER_DRAG_MIME = "application/x-morfa-layer";
const MIN_LEFT_PANEL_WIDTH = 150;
const MAX_LEFT_PANEL_WIDTH = 360;
const MIN_RIGHT_PANEL_WIDTH = 200;
const MAX_RIGHT_PANEL_WIDTH = 440;
const HIDDEN_STATE_LINT_KEYS = new Set([
  "projects.workspace.behavior.lint.initialStateMissing",
  "projects.workspace.behavior.lint.initialStateMultiple",
  "projects.workspace.behavior.lint.stateMissing",
  "projects.workspace.behavior.lint.stateUnreachable",
  "projects.workspace.behavior.lint.conditionStateMissing",
]);

function DraftInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  type = "text",
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  type?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const cancelRef = useRef(false);

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
        if (cancelRef.current) {
          cancelRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelRef.current = true;
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function DraftTextArea({
  value,
  onCommit,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [focused, value]);

  return (
    <textarea
      className={styles.fieldTextArea}
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      rows={4}
      maxLength={2000}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (cancelRef.current) {
          cancelRef.current = false;
          return;
        }
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancelRef.current = true;
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

function TargetDropSurface({
  enabled,
  pages,
  onTargetId,
  children,
}: {
  enabled: boolean;
  pages: CanvasPage[];
  onTargetId: (id: string) => void;
  children: ReactNode;
}) {
  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const nodeId = event.dataTransfer.getData(LAYER_DRAG_MIME);
    if (!nodeId || !pages.some((page) => page.id === nodeId)) return;
    event.preventDefault();
    event.stopPropagation();
    onTargetId(nodeId);
  };

  return (
    <div
      className={styles.dropSurface}
      onDragOver={(event) => {
        if (!enabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      {children}
    </div>
  );
}

function ConditionFields({
  condition,
  ownerId,
  pages,
  onChange,
}: {
  condition: CanvasBehaviorCondition;
  ownerId: string;
  pages: CanvasPage[];
  onChange: (condition: CanvasBehaviorCondition) => void;
}) {
  const { t } = useTranslation();
  const sourceDefinition =
    BEHAVIOR_CONDITION_SOURCES.find(
      (item) => item.source === condition.source,
    ) ?? BEHAVIOR_CONDITION_SOURCES[0];
  const sourceDefinitions = BEHAVIOR_CONDITION_SOURCES.filter(
    (item) => item.source !== "state" || condition.source === "state",
  );
  const needsTarget = sourceDefinition.needsTarget;
  const targetId = condition.targetId ?? ownerId;
  const target = pages.find((page) => page.id === targetId) ?? null;
  const targetStates = target?.behavior?.states ?? [];
  const dataEntry = target?.data?.find(
    (entry) => entry.key === condition.key,
  );
  const controlStates = target?.controlId
    ? pages.filter(
        (page) =>
          page.nodeKind === "control-state" &&
          page.controlId === target.controlId,
      )
    : [];
  const operatorOptions = BEHAVIOR_CONDITION_OPERATORS.filter((item) =>
    condition.source === "state" ||
    condition.source === "controlState" ||
    condition.source === "nodeVisible"
      ? item.operator === "eq" || item.operator === "neq"
      : true,
  );

  const replaceSource = (source: CanvasBehaviorConditionSource) => {
    const next = createBehaviorCondition(source);
    onChange({ ...next, id: condition.id, negate: condition.negate });
  };

  return (
    <TargetDropSurface
      enabled={needsTarget}
      pages={pages}
      onTargetId={(id) => onChange({ ...condition, targetId: id })}
    >
      <label className={styles.fieldRow}>
        <span>{t("projects.workspace.behavior.fields.conditionSource")}</span>
        <SelectField
          value={condition.source}
          ariaLabel={t("projects.workspace.behavior.fields.conditionSource")}
          onChange={(value) =>
            replaceSource(value as CanvasBehaviorConditionSource)
          }
        >
          {sourceDefinitions.map((item) => (
            <option value={item.source} key={item.source}>
              {t(item.labelKey)}
            </option>
          ))}
        </SelectField>
      </label>

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={Boolean(condition.negate)}
          onChange={(event) =>
            onChange({
              ...condition,
              negate: event.target.checked || undefined,
            })
          }
        />
        {t("projects.workspace.behavior.fields.negate")}
      </label>

      {condition.source === "nodeData" ||
      condition.source === "nodeStyle" ? (
        <label className={styles.fieldRow}>
          <span>
            {condition.source === "nodeStyle"
              ? t("projects.workspace.behavior.fields.styleKey")
              : t("projects.workspace.behavior.fields.dataKey")}
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
                : t("projects.workspace.behavior.chooseDataKey")}
            </option>
            {condition.source === "nodeStyle"
              ? BEHAVIOR_STYLE_KEYS.map((key) => (
                  <option value={key} key={key}>
                    {key}
                  </option>
                ))
              : (target?.data ?? []).map((item) => (
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
                ...(condition.source === "state" ||
                condition.source === "controlState"
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
        ) : condition.source === "controlState" ? (
          <select
            className={styles.fieldSelect}
            value={condition.value}
            onChange={(event) =>
              onChange({ ...condition, value: event.target.value })
            }
          >
            <option value="">
              {t("projects.workspace.behavior.chooseControlState")}
            </option>
            {controlStates.map((state) => (
              <option value={state.id} key={state.id}>
                {state.name}
              </option>
            ))}
          </select>
        ) : condition.source === "nodeVisible" ||
          dataEntry?.type === "boolean" ? (
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
          <DraftInput
            value={condition.value}
            ariaLabel={t(
              "projects.workspace.behavior.fields.compareValue",
            )}
            onCommit={(value) => onChange({ ...condition, value })}
          />
        )}
      </label>

      {needsTarget ? (
        <p className={styles.dropHint}>
          {t("projects.workspace.behavior.dropConditionHint")}
        </p>
      ) : null}
    </TargetDropSurface>
  );
}

function ActionFields({
  action,
  pages,
  behavior,
  ownerId,
  onChange,
}: {
  action: CanvasBehaviorAction;
  pages: CanvasPage[];
  behavior: CanvasBehavior;
  ownerId: string;
  onChange: (patch: Partial<CanvasBehaviorAction>) => void;
}) {
  const { t } = useTranslation();
  const definition = BEHAVIOR_ACTION_DEFINITIONS.find(
    (item) => item.type === action.type,
  );
  const needsTarget = definition?.needsTarget ?? false;
  const needsValue = definition?.needsValue ?? false;
  const target = pages.find(
    (page) => page.id === (action.targetId ?? ownerId),
  );
  const targetData = target?.data ?? [];
  const controlStates = target?.controlId
    ? pages.filter(
        (page) =>
          page.nodeKind === "control-state" &&
          page.controlId === target.controlId,
      )
    : [];

  return (
    <TargetDropSurface
      enabled={needsTarget}
      pages={pages}
      onTargetId={(id) => onChange({ targetId: id })}
    >
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

      {action.type === "setData" ||
      action.type === "incrementData" ||
      action.type === "toggleData" ? (
        <label className={styles.fieldRow}>
          <span>{t("projects.workspace.behavior.fields.dataKey")}</span>
          <SelectField
            value={action.key ?? ""}
            onChange={(value) => onChange({ key: value })}
          >
            <option value="">
              {t("projects.workspace.behavior.chooseDataKey")}
            </option>
            {targetData.map((entry) => (
              <option value={entry.key} key={entry.key}>
                {entry.key} ({entry.type})
              </option>
            ))}
          </SelectField>
        </label>
      ) : null}

      {action.type === "setControlState" ? (
        <label className={styles.fieldRow}>
          <span>{t("projects.workspace.behavior.fields.controlState")}</span>
          <SelectField
            value={action.value ?? ""}
            onChange={(value) => onChange({ value })}
          >
            <option value="">
              {t("projects.workspace.behavior.chooseControlState")}
            </option>
            {controlStates.map((state) => (
              <option value={state.id} key={state.id}>
                {state.name}
              </option>
            ))}
          </SelectField>
        </label>
      ) : null}

      {needsValue &&
      action.type !== "setState" &&
      action.type !== "setControlState" ? (
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
    </TargetDropSurface>
  );
}

function BlockInspector({
  block,
  page,
  pages,
  behavior,
  supportedEvents,
  onChange,
  onDelete,
}: {
  block: CanvasBehaviorBlock;
  page: CanvasPage;
  pages: CanvasPage[];
  behavior: CanvasBehavior;
  supportedEvents: readonly string[];
  onChange: (patch: Partial<CanvasBehaviorBlock>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const eventValue = block.event ?? supportedEvents[0] ?? "click";
  const eventOptions = supportedEvents.includes(eventValue)
    ? [...supportedEvents]
    : [eventValue, ...supportedEvents];
  const action = block.action;
  const actionDefinitions = BEHAVIOR_ACTION_DEFINITIONS.filter(
    (definition) =>
      definition.type !== "setState" || action?.type === "setState",
  );

  const replaceActionType = (type: CanvasBehaviorActionType) => {
    const definition = BEHAVIOR_ACTION_DEFINITIONS.find(
      (item) => item.type === type,
    );
    const next = createBehaviorAction(type);
    if (action) next.id = action.id;
    if (definition?.needsTarget) {
      next.targetId = action?.targetId ?? page.id;
    }
    onChange({ action: next });
  };

  return (
    <div className={styles.inspector}>
      <div
        className={styles.inspectorHeader}
        data-node-drag-handle="true"
      >
        <span className={styles.inspectorKind}>
          {t(`projects.workspace.behavior.blockTypes.${block.type}`)}
        </span>
        <button
          className={styles.iconButton}
          type="button"
          aria-label={t("projects.workspace.behavior.deleteBlock")}
          onClick={onDelete}
        >
          ×
        </button>
      </div>

      {block.type === "event" ? (
        <div className={styles.inspectorFields}>
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.event")}</span>
            <SelectField
              value={eventValue}
              onChange={(value) => onChange({ event: value })}
            >
              {eventOptions.map((event) => (
                <option value={event} key={event}>
                  {t(behaviorEventLabelKey(event))}
                </option>
              ))}
            </SelectField>
          </label>
          <p className={styles.dropHint}>
            {t("projects.workspace.behavior.eventEditorHint")}
          </p>
        </div>
      ) : null}

      {block.type === "condition" ? (
        block.conditions?.length ? (
          <div className={styles.inspectorFields}>
            <label className={styles.fieldRow}>
              <span>
                {t("projects.workspace.behavior.fields.conditionMode")}
              </span>
              <SelectField
                value={block.conditionMode ?? "all"}
                onChange={(value) =>
                  onChange({ conditionMode: value as "all" | "any" })
                }
              >
                <option value="all">
                  {t("projects.workspace.behavior.conditionModeAll")}
                </option>
                <option value="any">
                  {t("projects.workspace.behavior.conditionModeAny")}
                </option>
              </SelectField>
            </label>
            {block.conditions.map((condition, index) => (
              <div
                className={styles.groupCondition}
                key={condition.id || index}
              >
                <div className={styles.groupConditionHeader}>
                  <span>
                    {t("projects.workspace.behavior.conditionTag")}{" "}
                    {index + 1}
                  </span>
                  <button
                    className={styles.iconButton}
                    type="button"
                    aria-label={t(
                      "projects.workspace.behavior.removeCondition",
                    )}
                    onClick={() =>
                      onChange({
                        conditions: block.conditions?.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
                <ConditionFields
                  condition={condition}
                  ownerId={page.id}
                  pages={pages}
                  onChange={(next) =>
                    onChange({
                      conditions: block.conditions?.map(
                        (item, itemIndex) =>
                          itemIndex === index ? next : item,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <button
              className={styles.paletteButton}
              type="button"
              onClick={() => {
                const next = createBehaviorCondition("nodeData");
                next.targetId = page.id;
                onChange({
                  conditions: [...(block.conditions ?? []), next],
                });
              }}
            >
              <span className={styles.paletteMark}>+</span>
              {t("projects.workspace.behavior.conditionsTitle")}
            </button>
          </div>
        ) : block.condition ? (
          <div className={styles.inspectorFields}>
            <ConditionFields
              condition={block.condition}
              ownerId={page.id}
              pages={pages}
              onChange={(condition) => onChange({ condition })}
            />
            <button
              className={styles.paletteButton}
              type="button"
              onClick={() => {
                const next = createBehaviorCondition("nodeData");
                next.targetId = page.id;
                onChange({
                  condition: undefined,
                  conditionMode: "all",
                  conditions: [block.condition!, next],
                });
              }}
            >
              <span className={styles.paletteMark}>+</span>
              {t("projects.workspace.behavior.addCondition")}
            </button>
          </div>
        ) : (
          <p className={styles.mutedText}>
            {t("projects.workspace.behavior.lint.blockConditionMissing")}
          </p>
        )
      ) : null}

      {block.type === "action" ? (
        action ? (
          <div className={styles.inspectorFields}>
            <label className={styles.fieldRow}>
              <span>{t("projects.workspace.behavior.fields.actionType")}</span>
              <SelectField
                value={action.type}
                onChange={(value) =>
                  replaceActionType(value as CanvasBehaviorActionType)
                }
              >
                {actionDefinitions.map((definition) => (
                  <option value={definition.type} key={definition.type}>
                    {t(behaviorActionLabelKey(definition.type))}
                  </option>
                ))}
              </SelectField>
            </label>
            <ActionFields
              action={action}
              pages={pages}
              behavior={behavior}
              ownerId={page.id}
              onChange={(patch) =>
                onChange({ action: { ...action, ...patch } })
              }
            />
          </div>
        ) : (
          <p className={styles.mutedText}>
            {t("projects.workspace.behavior.lint.blockActionMissing")}
          </p>
        )
      ) : null}

      {block.type === "note" ? (
        <div className={styles.inspectorFields}>
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.noteText")}</span>
          </label>
          <DraftTextArea
            value={block.text ?? ""}
            ariaLabel={t("projects.workspace.behavior.fields.noteText")}
            placeholder={t(
              "projects.workspace.behavior.notePlaceholder",
            )}
            onCommit={(text) => onChange({ text })}
          />
        </div>
      ) : null}
    </div>
  );
}

function PaletteSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={styles.panelSection}>
      <button
        className={styles.sectionToggle}
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={styles.chevron} data-open={open ? "true" : undefined}>
          ▸
        </span>
        {title}
      </button>
      {open ? <div className={styles.paletteBody}>{children}</div> : null}
    </section>
  );
}

type NewBehaviorBlock = Partial<CanvasBehaviorBlock> & {
  type: CanvasBehaviorBlock["type"];
};

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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(230);
  const [rightPanelWidth, setRightPanelWidth] = useState(270);
  const [convertedPageId, setConvertedPageId] = useState<string | null>(
    null,
  );
  const [openPalettes, setOpenPalettes] = useState<Record<string, boolean>>({
    blocks: true,
    events: false,
    conditions: false,
    actions: false,
  });
  const graphApiRef = useRef<BehaviorGraphCanvasApi | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const materializedRef = useRef<string | null>(null);

  const blocks = behavior?.blocks ?? [];
  const edges = behavior?.edges ?? [];
  const supportedEvents = page
    ? getSupportedEvents(page)
    : ["click", "load"];
  const lintItems = useMemo(() => collectBehaviorLint(pages), [pages]);
  const currentLint = page
    ? lintItems.filter(
        (item) =>
          item.pageId === page.id &&
          !HIDDEN_STATE_LINT_KEYS.has(item.messageKey),
      )
    : [];
  useEffect(() => {
    if (!page || !behavior) return;
    const signature = `${page.id}:${JSON.stringify(behavior)}`;
    if (materializedRef.current === signature) return;
    materializedRef.current = signature;
    const result = materializeBehaviorGraph(behavior);
    if (!result.changed) return;
    onUpdateBehavior(page.id, result.behavior);
    if (result.converted) setConvertedPageId(page.id);
  }, [page, behavior, onUpdateBehavior]);

  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [pageId]);

  useEffect(() => {
    if (convertedPageId && convertedPageId === page?.id) {
      graphApiRef.current?.fitView();
    }
  }, [convertedPageId, page?.id]);

  useEffect(() => {
    if (
      selectedNodeId &&
      !blocks.some((block) => block.id === selectedNodeId)
    ) {
      setSelectedNodeId(null);
    }
  }, [blocks, selectedNodeId]);

  useEffect(() => {
    if (
      selectedEdgeId &&
      !edges.some((edge) => edge.id === selectedEdgeId)
    ) {
      setSelectedEdgeId(null);
    }
  }, [edges, selectedEdgeId]);

  const updateBehavior = (next: CanvasBehavior) => {
    if (page) onUpdateBehavior(page.id, next);
  };

  const updateGraph = ({
    blocks: nextBlocks,
    edges: nextEdges,
  }: {
    blocks?: CanvasBehaviorBlock[];
    edges?: CanvasBehaviorEdge[];
  }) => {
    if (!behavior) return;
    updateBehavior({
      ...behavior,
      version: 2,
      triggers: [],
      blocks: nextBlocks ?? blocks,
      edges: nextEdges ?? edges,
    });
  };

  const patchBlock = (
    id: string,
    patch: Partial<CanvasBehaviorBlock>,
  ) => {
    updateGraph({
      blocks: blocks.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    });
  };

  const findFreePosition = (
    width: number,
    height: number,
    center: { x: number; y: number },
  ) => {
    const occupied = [
      ...blocks.map((block) => ({
        x: block.x,
        y: block.y,
        width: BEHAVIOR_GRAPH_NODE_WIDTH,
        height: 100,
      })),
    ];
    const overlaps = (x: number, y: number) =>
      occupied.some(
        (rect) =>
          x < rect.x + rect.width + 16 &&
          x + width + 16 > rect.x &&
          y < rect.y + rect.height + 16 &&
          y + height + 16 > rect.y,
      );

    let x = center.x - width / 2;
    let y = center.y - height / 2;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (!overlaps(x, y)) return { x: Math.round(x), y: Math.round(y) };
      x += 32;
      y += 24;
    }
    return { x: Math.round(x), y: Math.round(y) };
  };

  const addBlock = (partial: NewBehaviorBlock) => {
    if (!behavior || !page) return;
    const center = graphApiRef.current?.getViewportCenter() ?? {
      x: 240,
      y: 180,
    };
    const position = findFreePosition(
      BEHAVIOR_GRAPH_NODE_WIDTH,
      100,
      center,
    );
    const created = createBehaviorBlock(
      partial.type,
      position.x,
      position.y,
    );
    const block: CanvasBehaviorBlock = { ...created, ...partial };
    if (block.type === "condition" && block.condition && !block.condition.targetId) {
      block.condition = { ...block.condition, targetId: page.id };
    }
    if (block.type === "action" && block.action) {
      const definition = BEHAVIOR_ACTION_DEFINITIONS.find(
        (item) => item.type === block.action?.type,
      );
      if (definition?.needsTarget && !block.action.targetId) {
        block.action = { ...block.action, targetId: page.id };
      }
    }
    updateGraph({ blocks: [...blocks, block] });
    setSelectedNodeId(block.id);
    setSelectedEdgeId(null);
  };

  const addConditionBlock = (source: CanvasBehaviorConditionSource) => {
    const condition = createBehaviorCondition(source);
    addBlock({ type: "condition", condition });
  };

  const addActionBlock = (type: CanvasBehaviorActionType) => {
    addBlock({ type: "action", action: createBehaviorAction(type) });
  };

  const deleteBlock = (id: string) => {
    updateGraph({
      blocks: blocks.filter((block) => block.id !== id),
      edges: edges.filter((edge) => edge.from !== id && edge.to !== id),
    });
    if (selectedNodeId === id) setSelectedNodeId(null);
    setSelectedEdgeId(null);
  };

  const deleteEdge = (id: string) => {
    updateGraph({ edges: edges.filter((edge) => edge.id !== id) });
    if (selectedEdgeId === id) setSelectedEdgeId(null);
  };

  const deleteNode = (id: string) => {
    if (blocks.some((block) => block.id === id)) {
      deleteBlock(id);
    }
  };

  const addEdge = (from: string, to: string) => {
    if (!behavior) return;
    const knownIds = new Set(blocks.map((block) => block.id));
    if (!knownIds.has(from) || !knownIds.has(to)) return;
    const existing = edges.find(
      (edge) => edge.from === from && edge.to === to,
    );
    if (existing) {
      setSelectedEdgeId(existing.id);
      setSelectedNodeId(null);
      return;
    }
    const edge = createBehaviorEdge(from, to);
    updateGraph({ edges: [...edges, edge] });
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  };

  const moveNode = (id: string, x: number, y: number) => {
    if (!blocks.some((block) => block.id === id)) return;
    updateGraph({
      blocks: blocks.map((block) =>
        block.id === id ? { ...block, x, y } : block,
      ),
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (!panelRef.current?.contains(document.activeElement)) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, button, a, [contenteditable='true']",
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (selectedEdgeId) {
        deleteEdge(selectedEdgeId);
        return;
      }
      if (selectedNodeId) {
        deleteNode(selectedNodeId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const resizeRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);

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
    const maxHeight = Math.max(320, window.innerHeight * 0.86);
    onHeightChange(
      Math.min(
        maxHeight,
        Math.max(320, resize.startHeight + resize.startY - event.clientY),
      ),
    );
  };

  const expandedHeightRef = useRef<number | null>(null);

  const viewportHeight =
    typeof window === "undefined" ? 900 : window.innerHeight;
  const isExpanded = height > viewportHeight * 0.72;

  const toggleExpanded = () => {
    const maxHeight = Math.max(320, viewportHeight * 0.86);
    if (!isExpanded) {
      expandedHeightRef.current = height;
      onHeightChange(Math.round(maxHeight));
      return;
    }
    onHeightChange(
      expandedHeightRef.current ??
        Math.round(
          Math.min(620, Math.max(420, viewportHeight * 0.6)),
        ),
    );
    expandedHeightRef.current = null;
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const sideResizeRef = useRef<{
    side: "left" | "right";
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const clampPanelWidth = (
    side: "left" | "right",
    width: number,
  ) =>
    side === "left"
      ? Math.min(
          MAX_LEFT_PANEL_WIDTH,
          Math.max(MIN_LEFT_PANEL_WIDTH, width),
        )
      : Math.min(
          MAX_RIGHT_PANEL_WIDTH,
          Math.max(MIN_RIGHT_PANEL_WIDTH, width),
        );

  const startSideResize = (
    side: "left" | "right",
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    sideResizeRef.current = {
      side,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: side === "left" ? leftPanelWidth : rightPanelWidth,
    };
  };

  const handleSideResizeMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const resize = sideResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const delta = event.clientX - resize.startX;
    const width = clampPanelWidth(
      resize.side,
      resize.side === "left"
        ? resize.startWidth + delta
        : resize.startWidth - delta,
    );
    if (resize.side === "left") setLeftPanelWidth(width);
    else setRightPanelWidth(width);
  };

  const endSideResize = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (sideResizeRef.current?.pointerId !== event.pointerId) return;
    sideResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleSideResizeKeyDown = (
    side: "left" | "right",
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -16 : 16;
    if (side === "left") {
      setLeftPanelWidth((width) =>
        clampPanelWidth("left", width + delta),
      );
    } else {
      setRightPanelWidth((width) =>
        clampPanelWidth("right", width + delta),
      );
    }
  };

  const focusLintIssue = (issue: (typeof currentLint)[number]) => {
    if (issue.edgeId) {
      setSelectedEdgeId(issue.edgeId);
      setSelectedNodeId(null);
      return;
    }
    if (issue.blockId) {
      setSelectedNodeId(issue.blockId);
      setSelectedEdgeId(null);
    }
  };

  return (
    <section
      ref={panelRef}
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
          <span className={styles.versionBadge}>
            {t("projects.workspace.behavior.graphBadge")}
          </span>
          <span className={styles.headerPageName}>
            {page ? page.name : t("projects.workspace.behavior.noSelection")}
          </span>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.headerButton}
            type="button"
            aria-label={t(
              isExpanded
                ? "projects.workspace.behavior.restoreHeight"
                : "projects.workspace.behavior.expandHeight",
            )}
            onClick={toggleExpanded}
          >
            {isExpanded ? "⤡" : "⤢"}
          </button>
          <button
            className={styles.closeButton}
            type="button"
            aria-label={t("projects.workspace.behavior.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>

      {!page || !behavior ? (
        <div className={styles.emptyState}>
          {t("projects.workspace.behavior.noSelection")}
        </div>
      ) : (
        <div className={styles.body}>
          <aside
            className={styles.leftPanel}
            style={{ width: leftPanelWidth }}
          >
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
                      onClick={() => focusLintIssue(item)}
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

          </aside>

          <div
            className={styles.sideResizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("projects.workspace.behavior.resizeChecks")}
            aria-valuemin={MIN_LEFT_PANEL_WIDTH}
            aria-valuemax={MAX_LEFT_PANEL_WIDTH}
            aria-valuenow={Math.round(leftPanelWidth)}
            tabIndex={0}
            onPointerDown={(event) =>
              startSideResize("left", event)
            }
            onPointerMove={handleSideResizeMove}
            onPointerUp={endSideResize}
            onPointerCancel={endSideResize}
            onLostPointerCapture={endSideResize}
            onKeyDown={(event) =>
              handleSideResizeKeyDown("left", event)
            }
            onDoubleClick={() => setLeftPanelWidth(230)}
          />

          <main className={styles.graphStage}>
            {convertedPageId === page.id ? (
              <div className={styles.notice} role="status">
                <span>
                  {t("projects.workspace.behavior.convertedNotice")}
                </span>
                <button
                  className={styles.noticeClose}
                  type="button"
                  aria-label={t(
                    "projects.workspace.behavior.dismissNotice",
                  )}
                  onClick={() => setConvertedPageId(null)}
                >
                  ×
                </button>
              </div>
            ) : null}
            <BehaviorGraphCanvas
              pages={pages}
              blocks={blocks}
              edges={edges}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              fitKey={page.id}
              apiRef={graphApiRef}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                if (id) setSelectedEdgeId(null);
              }}
              onSelectEdge={(id) => {
                setSelectedEdgeId(id);
                if (id) setSelectedNodeId(null);
              }}
              onMoveNode={moveNode}
              onCreateEdge={addEdge}
              onDeleteEdge={deleteEdge}
              onDeleteNode={deleteNode}
              onCreateEvent={() =>
                addBlock({
                  type: "event",
                  event: supportedEvents[0] ?? "click",
                })
              }
              renderBlockEditor={(block) => (
                <BlockInspector
                  block={block}
                  page={page}
                  pages={pages}
                  behavior={behavior}
                  supportedEvents={supportedEvents}
                  onChange={(patch) => patchBlock(block.id, patch)}
                  onDelete={() => deleteBlock(block.id)}
                />
              )}
            />
          </main>

          <div
            className={styles.sideResizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("projects.workspace.behavior.resizePalette")}
            aria-valuemin={MIN_RIGHT_PANEL_WIDTH}
            aria-valuemax={MAX_RIGHT_PANEL_WIDTH}
            aria-valuenow={Math.round(rightPanelWidth)}
            tabIndex={0}
            onPointerDown={(event) =>
              startSideResize("right", event)
            }
            onPointerMove={handleSideResizeMove}
            onPointerUp={endSideResize}
            onPointerCancel={endSideResize}
            onLostPointerCapture={endSideResize}
            onKeyDown={(event) =>
              handleSideResizeKeyDown("right", event)
            }
            onDoubleClick={() => setRightPanelWidth(270)}
          />

          <aside
            className={styles.rightPanel}
            style={{ width: rightPanelWidth }}
          >
            <PaletteSection
              title={t("projects.workspace.behavior.blockPaletteTitle")}
              open={Boolean(openPalettes.blocks)}
              onToggle={() =>
                setOpenPalettes((current) => ({
                  ...current,
                  blocks: !current.blocks,
                }))
              }
            >
              <div className={styles.palette}>
                <button
                  className={styles.paletteButton}
                  type="button"
                  onClick={() =>
                    addBlock({
                      type: "event",
                      event: supportedEvents[0] ?? "click",
                    })
                  }
                >
                  <span className={styles.paletteMark}>+</span>
                  {t("projects.workspace.behavior.blockTypes.event")}
                </button>
                <button
                  className={styles.paletteButton}
                  type="button"
                  onClick={() => addConditionBlock("nodeData")}
                >
                  <span className={styles.paletteMark}>+</span>
                  {t("projects.workspace.behavior.blockTypes.condition")}
                </button>
                <button
                  className={styles.paletteButton}
                  type="button"
                  onClick={() => addActionBlock("setStyle")}
                >
                  <span className={styles.paletteMark}>+</span>
                  {t("projects.workspace.behavior.blockTypes.action")}
                </button>
                <button
                  className={styles.paletteButton}
                  type="button"
                  onClick={() => addBlock({ type: "note", text: "" })}
                >
                  <span className={styles.paletteMark}>+</span>
                  {t("projects.workspace.behavior.blockTypes.note")}
                </button>
              </div>
            </PaletteSection>

            <PaletteSection
              title={t("projects.workspace.behavior.eventsTitle")}
              open={Boolean(openPalettes.events)}
              onToggle={() =>
                setOpenPalettes((current) => ({
                  ...current,
                  events: !current.events,
                }))
              }
            >
              <div className={styles.palette}>
                {supportedEvents.map((event) => (
                  <button
                    className={styles.paletteButton}
                    type="button"
                    key={event}
                    onClick={() => addBlock({ type: "event", event })}
                  >
                    <span className={styles.paletteMark}>+</span>
                    {t(behaviorEventLabelKey(event))}
                  </button>
                ))}
              </div>
            </PaletteSection>

            <PaletteSection
              title={t("projects.workspace.behavior.conditionsTitle")}
              open={Boolean(openPalettes.conditions)}
              onToggle={() =>
                setOpenPalettes((current) => ({
                  ...current,
                  conditions: !current.conditions,
                }))
              }
            >
              <div className={styles.palette}>
                {BEHAVIOR_CONDITION_SOURCES.filter(
                  (definition) => definition.source !== "state",
                ).map((definition) => (
                  <button
                    className={styles.paletteButton}
                    type="button"
                    key={definition.source}
                    onClick={() => addConditionBlock(definition.source)}
                  >
                    <span className={styles.paletteMark}>+</span>
                    {t(definition.labelKey)}
                  </button>
                ))}
              </div>
            </PaletteSection>

            <PaletteSection
              title={t("projects.workspace.behavior.actionsTitle")}
              open={Boolean(openPalettes.actions)}
              onToggle={() =>
                setOpenPalettes((current) => ({
                  ...current,
                  actions: !current.actions,
                }))
              }
            >
              <div className={styles.palette}>
                {BEHAVIOR_ACTION_DEFINITIONS.filter(
                  (definition) => definition.type !== "setState",
                ).map((definition) => (
                  <button
                    className={styles.paletteButton}
                    type="button"
                    key={definition.type}
                    onClick={() => addActionBlock(definition.type)}
                  >
                    <span className={styles.paletteMark}>+</span>
                    {t(definition.labelKey)}
                  </button>
                ))}
              </div>
            </PaletteSection>
          </aside>
        </div>
      )}
    </section>
  );
}
