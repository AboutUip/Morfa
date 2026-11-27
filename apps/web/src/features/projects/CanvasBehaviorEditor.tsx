import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Trans, useTranslation } from "react-i18next";

import {
  propertyFieldId,
  resolvePropertyId,
} from "./canvasPropertyIds";
import type { CanvasTool } from "./canvasTools";
import { BEHAVIOR_PHRASE_MIME } from "./BehaviorGraphCanvas";
import type {
  CanvasBehavior,
  CanvasBehaviorAction,
  CanvasBehaviorActionType,
  CanvasBehaviorBlock,
  CanvasBehaviorCondition,
  CanvasBehaviorConditionOperator,
  CanvasBehaviorConditionSource,
  CanvasBehaviorEdge,
  CanvasLink,
  CanvasPage,
} from "./canvasDocument";
import { getEffectivePageData } from "./canvasDocument";
import {
  BEHAVIOR_ACTION_DEFINITIONS,
  BEHAVIOR_CONDITION_OPERATORS,
  BEHAVIOR_CONDITION_SOURCES,
  BEHAVIOR_STYLE_KEYS,
  actionField,
  applyActionField,
  applyConditionField,
  behaviorEventLabelKey,
  collectSharedBehaviorLint,
  conditionField,
  createBehaviorAction,
  createDefaultBehavior,
  createBehaviorBlock,
  createBehaviorCondition,
  createBehaviorEdge,
  createReferenceBlock,
  getSupportedEvents,
  materializeBehaviorGraph,
  readBehaviorApplyDraft,
  type BehaviorApplyEntry,
  type BehaviorField,
} from "./canvasBehavior";
import {
  BEHAVIOR_GRAPH_NODE_HEIGHT,
  BEHAVIOR_GRAPH_NODE_WIDTH,
  BehaviorGraphCanvas,
  BehaviorTargetDragContext,
  type BehaviorGraphCanvasApi,
} from "./BehaviorGraphCanvas";
import styles from "./CanvasBehaviorEditor.module.css";

function TargetSlot({
  blockId,
  kind,
  index,
  targetId,
  pages,
  onClear,
}: {
  blockId: string;
  kind: "action" | "condition" | "event" | "switch";
  index?: number;
  targetId?: string;
  ownerId: string;
  pages: CanvasPage[];
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const drag = useContext(BehaviorTargetDragContext);
  const filled = Boolean(targetId);
  const target = filled
    ? pages.find((page) => page.id === targetId) ?? null
    : null;
  const hoverKey = `${blockId}\0${kind}\0${index ?? ""}`;
  return (
    <div
      className={styles.targetSlot}
      data-target-slot="true"
      data-target-block={blockId}
      data-target-kind={kind}
      data-target-index={index ?? ""}
      data-empty={filled ? undefined : "true"}
      data-missing={filled && !target ? "true" : undefined}
      data-drop-active={drag.sourceBlockId ? "true" : undefined}
      data-drop-over={drag.hoverKey === hoverKey ? "true" : undefined}
    >
      <span className={styles.targetSlotName}>
        {filled
          ? target?.name ?? targetId
          : t("projects.workspace.behavior.dropTarget")}
      </span>
      {filled ? (
        <button
          className={styles.targetSlotClear}
          type="button"
          aria-label={t("projects.workspace.behavior.clearTarget")}
          onClick={onClear}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

const MODIFY_ACTION_TYPES = new Set([
  "setStyle",
  "setText",
  "setVisible",
  "setValue",
  "setChecked",
  "setData",
  "setControlState",
]);

function PropertyIdInput({
  page,
  pages,
  links,
  value,
  onChange,
}: {
  page: CanvasPage | null;
  pages: CanvasPage[];
  links: CanvasLink[];
  value: BehaviorField;
  onChange: (field: BehaviorField) => void;
}) {
  const { t } = useTranslation();
  const dataKeys = page
    ? getEffectivePageData(pages, links, page).keys()
    : [];
  return (
    <DraftInput
      value={propertyFieldId(value)}
      ariaLabel={t("projects.workspace.behavior.fields.propertyId")}
      placeholder={t(
        "projects.workspace.behavior.propertyIdPlaceholder",
      )}
      onCommit={(id) => {
        const field = resolvePropertyId(id, dataKeys);
        if (field) onChange(field);
      }}
    />
  );
}

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

function ConditionFields({
  condition,
  ownerId,
  pages,
  links,
  blockId,
  index,
  onChange,
}: {
  condition: CanvasBehaviorCondition;
  ownerId: string;
  pages: CanvasPage[];
  links: CanvasLink[];
  blockId: string;
  index?: number;
  onChange: (condition: CanvasBehaviorCondition) => void;
}) {
  const { t } = useTranslation();
  const sourceDefinition =
    BEHAVIOR_CONDITION_SOURCES.find(
      (item) => item.source === condition.source,
    ) ?? BEHAVIOR_CONDITION_SOURCES[0];
  const needsTarget = sourceDefinition.needsTarget && condition.source !== "state";
  const target = condition.targetId
    ? pages.find((page) => page.id === condition.targetId) ?? null
    : null;
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

  const sentenceKey =
    condition.source === "nodeText" ||
    condition.source === "nodeValue" ||
    condition.source === "nodeVisible" ||
    condition.source === "nodeStyle" ||
    condition.source === "controlState" ||
    condition.source === "state"
      ? condition.source
      : "nodeData";
  const clearTarget = () =>
    onChange({
      ...condition,
      targetId: undefined,
      ...(condition.source === "state" ||
      condition.source === "controlState"
        ? { value: "" }
        : {}),
    });

  return (
    <Trans
      parent="div"
      className={styles.sentence}
      i18nKey={
        condition.source === "state"
          ? `projects.workspace.behavior.sentences.${sentenceKey}`
          : "projects.workspace.behavior.sentences.judge"
      }
      components={{
        not: (
          <button
            className={styles.sentenceToggle}
            type="button"
            data-on={condition.negate ? "true" : undefined}
            aria-pressed={Boolean(condition.negate)}
            onClick={() =>
              onChange({
                ...condition,
                negate: condition.negate ? undefined : true,
              })
            }
          >
            {t("projects.workspace.behavior.phrases.not")}
          </button>
        ),
        slot: needsTarget ? (
          <TargetSlot
            blockId={blockId}
            kind="condition"
            index={index}
            targetId={condition.targetId}
            ownerId={ownerId}
            pages={pages}
            onClear={clearTarget}
          />
        ) : (
          <span />
        ),
        prop: (
          <PropertyIdInput
            page={target}
            pages={pages}
            links={links}
            value={conditionField(condition)}
            onChange={(field) =>
              onChange(applyConditionField(condition, field))
            }
          />
        ),
        key: (
          <select
            className={styles.fieldSelect}
            aria-label={
              condition.source === "nodeStyle"
                ? t("projects.workspace.behavior.fields.styleKey")
                : t("projects.workspace.behavior.fields.dataKey")
            }
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
                    {item.key}
                  </option>
                ))}
          </select>
        ),
        op: (
          <select
            className={styles.fieldSelect}
            aria-label={t("projects.workspace.behavior.fields.operator")}
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
                {t(
                  `projects.workspace.behavior.phrases.operators.${item.operator}`,
                )}
              </option>
            ))}
          </select>
        ),
        value:
          condition.source === "state" ? (
            <select
              className={styles.fieldSelect}
              aria-label={t("projects.workspace.behavior.fields.state")}
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
              aria-label={t(
                "projects.workspace.behavior.fields.controlState",
              )}
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
          ) : condition.source === "nodeVisible" ? (
            <select
              className={styles.fieldSelect}
              aria-label={t(
                "projects.workspace.behavior.fields.compareValue",
              )}
              value={condition.value === "false" ? "false" : "true"}
              onChange={(event) =>
                onChange({ ...condition, value: event.target.value })
              }
            >
              <option value="true">
                {t("projects.workspace.behavior.phrases.visible")}
              </option>
              <option value="false">
                {t("projects.workspace.behavior.phrases.hidden")}
              </option>
            </select>
          ) : dataEntry?.type === "boolean" ? (
            <select
              className={styles.fieldSelect}
              aria-label={t(
                "projects.workspace.behavior.fields.compareValue",
              )}
              value={condition.value === "false" ? "false" : "true"}
              onChange={(event) =>
                onChange({ ...condition, value: event.target.value })
              }
            >
              <option value="true">
                {t("projects.workspace.behavior.phrases.yes")}
              </option>
              <option value="false">
                {t("projects.workspace.behavior.phrases.no")}
              </option>
            </select>
          ) : (
            <DraftInput
              value={condition.value}
              ariaLabel={t(
                "projects.workspace.behavior.fields.compareValue",
              )}
              onCommit={(value) => onChange({ ...condition, value })}
            />
          ),
      }}
    />
  );
}

function ApplyEntryList({
  pages,
  value,
  onChange,
}: {
  pages: CanvasPage[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const entries = readBehaviorApplyDraft(value);
  const write = (next: BehaviorApplyEntry[]) => {
    onChange(JSON.stringify(next));
  };
  const update = (index: number, patch: Partial<BehaviorApplyEntry>) => {
    write(
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );
  };

  return (
    <div className={styles.applyList}>
      {entries.map((entry, index) => (
        <div className={styles.applyRow} key={index}>
          <select
            className={styles.fieldSelect}
            aria-label={t("projects.workspace.behavior.applyTarget")}
            value={entry.targetId}
            onChange={(event) =>
              update(index, { targetId: event.target.value })
            }
          >
            <option value="">
              {t("projects.workspace.behavior.applyTarget")}
            </option>
            {pages.map((page) => (
              <option value={page.id} key={page.id}>
                {page.name || page.id}
              </option>
            ))}
          </select>
          <select
            className={styles.fieldSelect}
            aria-label={t("projects.workspace.behavior.applyKind")}
            value={entry.kind}
            onChange={(event) =>
              update(index, {
                kind: event.target.value as BehaviorApplyEntry["kind"],
              })
            }
          >
            <option value="data">
              {t("projects.workspace.behavior.applyKinds.data")}
            </option>
            <option value="style">
              {t("projects.workspace.behavior.applyKinds.style")}
            </option>
            <option value="text">
              {t("projects.workspace.behavior.applyKinds.text")}
            </option>
          </select>
          {entry.kind === "text" ? null : (
            <input
              className={styles.fieldInput}
              aria-label={t("projects.workspace.behavior.applyKey")}
              value={entry.key}
              placeholder={t("projects.workspace.behavior.applyKey")}
              onChange={(event) => update(index, { key: event.target.value })}
            />
          )}
          <input
            className={styles.fieldInput}
            aria-label={t("projects.workspace.behavior.applyValue")}
            value={entry.value}
            placeholder={t("projects.workspace.behavior.applyValue")}
            onChange={(event) =>
              update(index, { value: event.target.value })
            }
          />
          <button
            className={styles.applyRemove}
            type="button"
            onClick={() =>
              write(entries.filter((_, entryIndex) => entryIndex !== index))
            }
          >
            {t("projects.workspace.behavior.applyRemove")}
          </button>
        </div>
      ))}
      <button
        className={styles.addPhrase}
        type="button"
        onClick={() =>
          write([
            ...entries,
            { targetId: "", kind: "data", key: "", value: "" },
          ])
        }
      >
        {t("projects.workspace.behavior.applyAdd")}
      </button>
    </div>
  );
}

function ActionFields({
  action,
  pages,
  links,
  behavior,
  ownerId,
  blockId,
  onChange,
}: {
  action: CanvasBehaviorAction;
  pages: CanvasPage[];
  links: CanvasLink[];
  behavior: CanvasBehavior;
  ownerId: string;
  blockId: string;
  onChange: (patch: Partial<CanvasBehaviorAction>) => void;
}) {
  const { t } = useTranslation();
  const definition = BEHAVIOR_ACTION_DEFINITIONS.find(
    (item) => item.type === action.type,
  );
  const needsTarget = definition?.needsTarget ?? false;
  const modify = MODIFY_ACTION_TYPES.has(action.type);
  const target = action.targetId
    ? pages.find((page) => page.id === action.targetId) ?? null
    : null;
  const targetData = target?.data ?? [];
  const controlStates = target?.controlId
    ? pages.filter(
        (page) =>
          page.nodeKind === "control-state" &&
          page.controlId === target.controlId,
      )
    : [];

  const sentenceKey = [
    "navigate",
    "setStyle",
    "setText",
    "setVisible",
    "setValue",
    "setChecked",
    "setState",
    "setControlState",
    "setData",
    "incrementData",
    "toggleData",
  ].includes(action.type)
    ? action.type
    : "setText";
  const dataKeySelect = (
    <select
      className={styles.fieldSelect}
      aria-label={t("projects.workspace.behavior.fields.dataKey")}
      value={action.key ?? ""}
      onChange={(event) => onChange({ key: event.target.value })}
    >
      <option value="">
        {t("projects.workspace.behavior.chooseDataKey")}
      </option>
      {targetData.map((entry) => (
        <option value={entry.key} key={entry.key}>
          {entry.key}
        </option>
      ))}
    </select>
  );

  if (action.type === "apply") {
    return (
      <ApplyEntryList
        pages={pages}
        value={action.value}
        onChange={(value) => onChange({ value })}
      />
    );
  }

  return (
    <Trans
      parent="div"
      className={styles.sentence}
      i18nKey={
        action.type === "setData" ||
        action.type === "incrementData" ||
        action.type === "toggleData"
          ? `projects.workspace.behavior.sentences.${action.type}`
          : modify
            ? "projects.workspace.behavior.sentences.modify"
            : `projects.workspace.behavior.sentences.${sentenceKey}`
      }
      components={{
        slot: needsTarget ? (
          <TargetSlot
            blockId={blockId}
            kind="action"
            targetId={action.targetId}
            ownerId={ownerId}
            pages={pages}
            onClear={() => {
              const patch: Partial<CanvasBehaviorAction> = {
                targetId: undefined,
              };
              if (action.type === "setControlState") patch.value = "";
              onChange(patch);
            }}
          />
        ) : (
          <span />
        ),
        prop: (
          <PropertyIdInput
            page={target}
            pages={pages}
            links={links}
            value={actionField(action)}
            onChange={(field) => onChange(applyActionField(action, field))}
          />
        ),
        key:
          action.type === "setStyle" ? (
            <SelectField
              value={action.key ?? "background-color"}
              ariaLabel={t("projects.workspace.behavior.fields.styleKey")}
              onChange={(value) => onChange({ key: value })}
            >
              {BEHAVIOR_STYLE_KEYS.map((key) => (
                <option value={key} key={key}>
                  {key}
                </option>
              ))}
            </SelectField>
          ) : (
            dataKeySelect
          ),
        page: (
          <select
            className={styles.fieldSelect}
            aria-label={t("projects.workspace.behavior.fields.targetPage")}
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
        ),
        value:
          action.type === "setState" ? (
            <SelectField
              value={action.value ?? ""}
              ariaLabel={t("projects.workspace.behavior.fields.state")}
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
          ) : action.type === "setControlState" ? (
            <SelectField
              value={action.value ?? ""}
              ariaLabel={t(
                "projects.workspace.behavior.fields.controlState",
              )}
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
          ) : action.type === "setVisible" ? (
            <SelectField
              value={action.value === "false" ? "false" : "true"}
              ariaLabel={t("projects.workspace.behavior.fields.value")}
              onChange={(value) => onChange({ value })}
            >
              <option value="true">
                {t("projects.workspace.behavior.phrases.visible")}
              </option>
              <option value="false">
                {t("projects.workspace.behavior.phrases.hidden")}
              </option>
            </SelectField>
          ) : action.type === "setChecked" ? (
            <SelectField
              value={action.value === "false" ? "false" : "true"}
              ariaLabel={t("projects.workspace.behavior.fields.value")}
              onChange={(value) => onChange({ value })}
            >
              <option value="true">
                {t("projects.workspace.behavior.phrases.checkedOn")}
              </option>
              <option value="false">
                {t("projects.workspace.behavior.phrases.checkedOff")}
              </option>
            </SelectField>
          ) : (
            <DraftInput
              value={action.value ?? ""}
              ariaLabel={t("projects.workspace.behavior.fields.value")}
              onCommit={(value) => onChange({ value })}
            />
          ),
      }}
    />
  );
}

const SHARED_OWNER_ID = "";

function BlockInspector({
  block,
  pages,
  links,
  behavior,
  onChange,
  onRewrite,
}: {
  block: CanvasBehaviorBlock;
  pages: CanvasPage[];
  links: CanvasLink[];
  behavior: CanvasBehavior;
  onChange: (patch: Partial<CanvasBehaviorBlock>) => void;
  onRewrite: (
    patch: Partial<CanvasBehaviorBlock>,
    edges: CanvasBehaviorEdge[],
  ) => void;
}) {
  const { t } = useTranslation();
  const boundPage = block.nodeId
    ? pages.find((page) => page.id === block.nodeId) ?? null
    : null;
  const nodeEvents = boundPage ? getSupportedEvents(boundPage) : ["click"];
  const eventValue = block.event ?? nodeEvents[0] ?? "click";
  const eventOptions = nodeEvents.includes(eventValue)
    ? [...nodeEvents]
    : [eventValue, ...nodeEvents];
  const action = block.action;

  return (
    <div className={styles.nodeFields}>
      {block.type === "event" ? (
        <Trans
          parent="div"
          className={styles.sentence}
          i18nKey="projects.workspace.behavior.sentences.event"
          components={{
            slot: (
              <TargetSlot
                blockId={block.id}
                kind="event"
                targetId={block.nodeId}
                ownerId={SHARED_OWNER_ID}
                pages={pages}
                onClear={() => onChange({ nodeId: undefined })}
              />
            ),
            event: (
              <SelectField
                value={eventValue}
                ariaLabel={t("projects.workspace.behavior.fields.event")}
                onChange={(value) => onChange({ event: value })}
              >
                {eventOptions.map((event) => (
                  <option value={event} key={event}>
                    {t(behaviorEventLabelKey(event))}
                  </option>
                ))}
              </SelectField>
            ),
          }}
        />
      ) : null}

      {block.type === "condition" ? (
        block.conditions?.length ? (
          <div className={styles.inspectorFields}>
            <Trans
              parent="div"
              className={styles.sentence}
              i18nKey="projects.workspace.behavior.sentences.group"
              components={{
                mode: (
                  <SelectField
                    value={block.conditionMode ?? "all"}
                    ariaLabel={t(
                      "projects.workspace.behavior.fields.conditionMode",
                    )}
                    onChange={(value) =>
                      onChange({
                        conditionMode: value as "all" | "any",
                      })
                    }
                  >
                    <option value="all">
                      {t("projects.workspace.behavior.conditionModeAll")}
                    </option>
                    <option value="any">
                      {t("projects.workspace.behavior.conditionModeAny")}
                    </option>
                  </SelectField>
                ),
              }}
            />
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
                  ownerId={SHARED_OWNER_ID}
                  pages={pages}
                  links={links}
                  blockId={block.id}
                  index={index}
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
              className={styles.addPhrase}
              type="button"
              onClick={() => {
                const next = createBehaviorCondition("nodeData");
                onChange({
                  conditions: [...(block.conditions ?? []), next],
                });
              }}
            >
              {t("projects.workspace.behavior.phrases.addJudgment")}
            </button>
          </div>
        ) : block.condition ? (
          <div className={styles.inspectorFields}>
            <ConditionFields
              condition={block.condition}
              ownerId={SHARED_OWNER_ID}
              pages={pages}
              links={links}
              blockId={block.id}
              onChange={(condition) => onChange({ condition })}
            />
            <button
              className={styles.addPhrase}
              type="button"
              onClick={() => {
                const next = createBehaviorCondition("nodeData");
                onChange({
                  condition: undefined,
                  conditionMode: "all",
                  conditions: [block.condition!, next],
                });
              }}
            >
              {t("projects.workspace.behavior.phrases.addJudgment")}
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
            <ActionFields
              action={action}
              pages={pages}
              links={links}
              behavior={behavior}
              ownerId={SHARED_OWNER_ID}
              blockId={block.id}
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

      {block.type === "switch" ? (
        <div className={styles.inspectorFields}>
          <Trans
            parent="div"
            className={styles.sentence}
            i18nKey="projects.workspace.behavior.sentences.switch"
            components={{
              slot: (
                <TargetSlot
                  blockId={block.id}
                  kind="switch"
                  targetId={block.nodeId}
                  ownerId={SHARED_OWNER_ID}
                  pages={pages}
                  onClear={() => onChange({ nodeId: undefined })}
                />
              ),
              prop: (
                <PropertyIdInput
                  page={boundPage}
                  pages={pages}
                  links={links}
                  value={
                    resolvePropertyId(
                      block.key ?? "",
                      boundPage
                        ? getEffectivePageData(
                            pages,
                            links,
                            boundPage,
                          ).keys()
                        : [],
                    ) ?? { kind: "style", key: block.key ?? "" }
                  }
                  onChange={(field) =>
                    onChange({ key: propertyFieldId(field) })
                  }
                />
              ),
            }}
          />
          <div className={styles.caseList}>
            {(block.cases?.length ? block.cases : [""]).map(
              (item, index) => (
                <div className={styles.caseRow} key={index}>
                  <DraftInput
                    value={item}
                    ariaLabel={t(
                      "projects.workspace.behavior.fields.caseValue",
                    )}
                    placeholder={t(
                      "projects.workspace.behavior.casePlaceholder",
                    )}
                    onCommit={(value) => {
                      const cases = [
                        ...(block.cases?.length ? block.cases : [""]),
                      ];
                      cases[index] = value;
                      onChange({ cases });
                    }}
                  />
                  <button
                    className={styles.iconButton}
                    type="button"
                    aria-label={t(
                      "projects.workspace.behavior.removeCase",
                    )}
                    onClick={() => {
                      const cases = (
                        block.cases?.length ? block.cases : [""]
                      ).filter((_, itemIndex) => itemIndex !== index);
                      onRewrite(
                        { cases },
                        (behavior.edges ?? [])
                          .filter(
                            (edge) =>
                              edge.from !== block.id ||
                              edge.label !== `case:${index}`,
                          )
                          .map((edge) => {
                            if (
                              edge.from !== block.id ||
                              !edge.label?.startsWith("case:")
                            ) {
                              return edge;
                            }
                            const caseIndex = Number(
                              edge.label.slice(5),
                            );
                            if (caseIndex > index) {
                              return {
                                ...edge,
                                label: `case:${caseIndex - 1}`,
                              };
                            }
                            return edge;
                          }),
                      );
                    }}
                  >
                    ×
                  </button>
                </div>
              ),
            )}
            <button
              className={styles.addPhrase}
              type="button"
              onClick={() =>
                onChange({
                  cases: [...(block.cases ?? []), ""],
                })
              }
            >
              {t("projects.workspace.behavior.phrases.addCase")}
            </button>
          </div>
        </div>
      ) : null}

      {block.type === "reference" ? (
        <div className={styles.referenceBody}>
          <strong>
            {pages.find((item) => item.id === block.nodeId)?.name ??
              t("projects.workspace.behavior.lint.referenceMissing")}
          </strong>
          <span>{t("projects.workspace.behavior.referenceHint")}</span>
        </div>
      ) : null}

      {block.type === "function" ? (
        <div className={styles.inspectorFields}>
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.functionName")}</span>
          </label>
          <DraftInput
            value={block.text ?? ""}
            ariaLabel={t("projects.workspace.behavior.fields.functionName")}
            placeholder={t("projects.workspace.behavior.functionPlaceholder")}
            onCommit={(text) => onChange({ text })}
          />
          <p className={styles.mutedText}>
            {t("projects.workspace.behavior.functionHint")}
          </p>
        </div>
      ) : null}

      {block.type === "call" ? (
        <div className={styles.inspectorFields}>
          <label className={styles.fieldRow}>
            <span>{t("projects.workspace.behavior.fields.callFunction")}</span>
            <select
              className={styles.fieldSelect}
              value={block.key ?? ""}
              aria-label={t("projects.workspace.behavior.fields.callFunction")}
              onChange={(event) =>
                onChange({
                  key: event.target.value || undefined,
                })
              }
            >
              <option value="">
                {t("projects.workspace.behavior.chooseFunction")}
              </option>
              {behavior.blocks
                ?.filter((item) => item.type === "function")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.text?.trim() ||
                      t("projects.workspace.behavior.blockTypes.function")}
                  </option>
                ))}
            </select>
          </label>
          <p className={styles.mutedText}>
            {t("projects.workspace.behavior.callHint")}
          </p>
        </div>
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

type NewBehaviorBlock = Partial<CanvasBehaviorBlock> & {
  type: CanvasBehaviorBlock["type"];
};

function PhraseButton({
  kind,
  label,
  onAdd,
}: {
  kind: string;
  label: string;
  onAdd: () => void;
}) {
  const dragged = useRef(false);
  return (
    <button
      className={styles.phraseButton}
      type="button"
      data-kind={kind}
      draggable
      onDragStart={(event) => {
        dragged.current = true;
        event.dataTransfer.setData(BEHAVIOR_PHRASE_MIME, kind);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onAdd();
      }}
    >
      {label}
    </button>
  );
}

export function CanvasBehaviorEditor({
  pages,
  links,
  behavior: sourceBehavior,
  scopeId,
  scopeName,
  activeTool,
  height,
  onHeightChange,
  onClose,
  onUpdateBehavior,
}: {
  pages: CanvasPage[];
  links: CanvasLink[];
  behavior: CanvasBehavior | null;
  scopeId: string;
  scopeName: string;
  activeTool: CanvasTool;
  height: number;
  onHeightChange: (height: number) => void;
  onClose: () => void;
  onUpdateBehavior: (behavior: CanvasBehavior) => void;
}) {
  const { t } = useTranslation();
  const behavior = sourceBehavior ?? createDefaultBehavior();
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(230);
  const [rightPanelWidth, setRightPanelWidth] = useState(270);
  const [convertedPageId, setConvertedPageId] = useState<string | null>(
    null,
  );
  const [editingFunctionId, setEditingFunctionId] = useState<string | null>(
    null,
  );
  const graphApiRef = useRef<BehaviorGraphCanvasApi | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const materializedRef = useRef<string | null>(null);

  const blocks = behavior?.blocks ?? [];
  const edges = behavior?.edges ?? [];
  const visibleBlocks = useMemo(() => {
    if (!editingFunctionId) {
      return blocks.filter((block) => !block.scopeId);
    }
    return blocks.filter(
      (block) =>
        block.id === editingFunctionId ||
        block.scopeId === editingFunctionId,
    );
  }, [blocks, editingFunctionId]);
  const visibleIds = useMemo(
    () => new Set(visibleBlocks.map((block) => block.id)),
    [visibleBlocks],
  );
  const visibleEdges = useMemo(
    () =>
      edges.filter(
        (edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to),
      ),
    [edges, visibleIds],
  );
  const editingFunction = editingFunctionId
    ? blocks.find((block) => block.id === editingFunctionId)
    : undefined;
  const inspectedBlock =
    selectedNodeIds.length === 1
      ? visibleBlocks.find((block) => block.id === selectedNodeIds[0])
      : undefined;
  const currentLint = useMemo(
    () =>
      collectSharedBehaviorLint(pages, behavior, {
        id: scopeId,
        name: scopeName,
      }).filter((item) => !HIDDEN_STATE_LINT_KEYS.has(item.messageKey)),
    [pages, behavior, scopeId, scopeName],
  );
  useEffect(() => {
    const signature = `${scopeId}:${JSON.stringify(behavior)}`;
    if (materializedRef.current === signature) return;
    materializedRef.current = signature;
    const result = materializeBehaviorGraph(behavior);
    if (!result.changed) return;
    onUpdateBehavior(result.behavior);
    if (result.converted) setConvertedPageId(scopeId);
  }, [scopeId, behavior, onUpdateBehavior]);

  useEffect(() => {
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    setEditingFunctionId(null);
  }, [scopeId]);

  useEffect(() => {
    if (!editingFunctionId) return;
    const owner = blocks.find((block) => block.id === editingFunctionId);
    if (!owner || owner.type !== "function") setEditingFunctionId(null);
  }, [blocks, editingFunctionId]);

  useEffect(() => {
    if (convertedPageId && convertedPageId === scopeId) {
      graphApiRef.current?.fitView();
    }
  }, [convertedPageId, scopeId]);

  useEffect(() => {
    setSelectedNodeIds((current) => {
      const next = current.filter((id) =>
        blocks.some((block) => block.id === id),
      );
      return next.length === current.length ? current : next;
    });
  }, [blocks]);

  useEffect(() => {
    if (
      selectedEdgeId &&
      !edges.some((edge) => edge.id === selectedEdgeId)
    ) {
      setSelectedEdgeId(null);
    }
  }, [edges, selectedEdgeId]);

  const updateBehavior = (next: CanvasBehavior) => {
    onUpdateBehavior(next);
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
    const occupied = visibleBlocks.map((block) => ({
      x: block.x,
      y: block.y,
      width: BEHAVIOR_GRAPH_NODE_WIDTH,
      height: BEHAVIOR_GRAPH_NODE_HEIGHT[block.type],
    }));
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

  const addBlock = (
    partial: NewBehaviorBlock,
    point?: { x: number; y: number },
  ) => {
    if (!behavior) return;
    const center = graphApiRef.current?.getViewportCenter() ?? {
      x: 240,
      y: 180,
    };
    const position = point
      ? { x: Math.round(point.x), y: Math.round(point.y) }
      : findFreePosition(
          BEHAVIOR_GRAPH_NODE_WIDTH,
          BEHAVIOR_GRAPH_NODE_HEIGHT[partial.type],
          center,
        );
    const created = createBehaviorBlock(
      partial.type,
      position.x,
      position.y,
    );
    const block: CanvasBehaviorBlock = {
      ...created,
      ...partial,
      ...(editingFunctionId ? { scopeId: editingFunctionId } : {}),
    };
    updateGraph({ blocks: [...blocks, block] });
    setSelectedNodeIds([block.id]);
    setSelectedEdgeId(null);
  };

  const createPhrase = (phrase: string, x: number, y: number) => {
    const point = { x, y };
    if (phrase === "event") {
      addBlock({ type: "event", event: "click" }, point);
      return;
    }
    if (phrase === "condition") {
      addBlock(
        {
          type: "condition",
          condition: createBehaviorCondition("nodeText"),
        },
        point,
      );
      return;
    }
    if (phrase === "navigate") {
      addBlock(
        { type: "action", action: createBehaviorAction("navigate") },
        point,
      );
      return;
    }
    if (phrase === "switch") {
      addBlock({ type: "switch" }, point);
      return;
    }
    if (phrase === "function") {
      addBlock({ type: "function", text: "函数" }, point);
      return;
    }
    if (phrase === "call") {
      addBlock({ type: "call" }, point);
      return;
    }
    if (phrase === "data") {
      addBlock(
        { type: "action", action: createBehaviorAction("setData") },
        point,
      );
      return;
    }
    if (phrase === "apply") {
      addBlock(
        { type: "action", action: createBehaviorAction("apply") },
        point,
      );
      return;
    }
    if (phrase === "action") {
      addBlock(
        { type: "action", action: createBehaviorAction("setText") },
        point,
      );
    }
  };

  const createReference = (nodeId: string, x: number, y: number) => {
    if (!behavior || !pages.some((item) => item.id === nodeId)) return;
    const existing = blocks.find(
      (block) =>
        block.type === "reference" &&
        block.nodeId === nodeId &&
        (block.scopeId ?? null) === editingFunctionId,
    );
    if (existing) {
      setSelectedNodeIds([existing.id]);
      setSelectedEdgeId(null);
      return;
    }
    const block = {
      ...createReferenceBlock(nodeId, Math.round(x), Math.round(y)),
      ...(editingFunctionId ? { scopeId: editingFunctionId } : {}),
    };
    updateGraph({ blocks: [...blocks, block] });
    setSelectedNodeIds([block.id]);
    setSelectedEdgeId(null);
  };

  const assignReference = (
    referenceBlockId: string,
    target: {
      blockId: string;
      kind: "action" | "condition" | "event" | "switch";
      index: number | null;
    },
  ) => {
    const reference = blocks.find((block) => block.id === referenceBlockId);
    if (
      !reference ||
      reference.type !== "reference" ||
      !reference.nodeId
    ) {
      return;
    }
    const block = blocks.find((item) => item.id === target.blockId);
    if (!block) return;
    const targetId = reference.nodeId;
    let patch: Partial<CanvasBehaviorBlock> | null = null;
    if (target.kind === "event" || target.kind === "switch") {
      const bound = pages.find((page) => page.id === targetId);
      const events = bound ? getSupportedEvents(bound) : [];
      const event =
        target.kind === "event"
          ? events.includes(block.event ?? "")
            ? block.event
            : events[0] ?? block.event
          : block.event;
      patch = {
        nodeId: targetId,
        ...(target.kind === "event" ? { event } : {}),
      };
    } else if (target.kind === "action" && block.action) {
      const next = { ...block.action, targetId };
      if (
        block.action.targetId !== targetId &&
        next.type === "setControlState"
      ) {
        next.value = "";
      }
      patch = { action: next };
    } else if (target.kind === "condition") {
      const apply = (condition: CanvasBehaviorCondition) => {
        const next = { ...condition, targetId };
        if (
          condition.targetId !== targetId &&
          (next.source === "state" || next.source === "controlState")
        ) {
          next.value = "";
        }
        return next;
      };
      if (target.index === null && block.condition) {
        patch = { condition: apply(block.condition) };
      } else if (target.index !== null && block.conditions) {
        patch = {
          conditions: block.conditions.map((item, itemIndex) =>
            itemIndex === target.index ? apply(item) : item,
          ),
        };
      }
    }
    if (!patch) return;
    updateGraph({
      blocks: blocks
        .filter((item) => item.id !== referenceBlockId)
        .map((item) =>
          item.id === block.id ? { ...item, ...patch } : item,
        ),
      edges: edges.filter(
        (edge) =>
          edge.from !== referenceBlockId && edge.to !== referenceBlockId,
      ),
    });
    setSelectedNodeIds([block.id]);
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
    setSelectedNodeIds((current) =>
      current.filter((selectedId) => selectedId !== id),
    );
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

  const addEdge = (from: string, to: string, label?: string) => {
    if (!behavior) return;
    const knownIds = new Set(blocks.map((block) => block.id));
    if (!knownIds.has(from) || !knownIds.has(to)) return;
    const port = !label || label === "out" ? undefined : label;
    const existing = edges.find(
      (edge) => edge.from === from && edge.to === to && edge.label === port,
    );
    if (existing) {
      setSelectedEdgeId(existing.id);
      setSelectedNodeIds([]);
      return;
    }
    const edge = createBehaviorEdge(from, to, port);
    updateGraph({ edges: [...edges, edge] });
    setSelectedEdgeId(edge.id);
    setSelectedNodeIds([]);
  };

  const moveNodes = (moves: { id: string; x: number; y: number }[]) => {
    if (!moves.length) return;
    const byId = new Map(moves.map((move) => [move.id, move]));
    updateGraph({
      blocks: blocks.map((block) => {
        const move = byId.get(block.id);
        return move ? { ...block, x: move.x, y: move.y } : block;
      }),
    });
  };

  const moveNode = (id: string, x: number, y: number) => {
    moveNodes([{ id, x, y }]);
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
      if (selectedNodeIds.length) {
        const idSet = new Set(selectedNodeIds);
        updateGraph({
          blocks: blocks.filter((block) => !idSet.has(block.id)),
          edges: edges.filter(
            (edge) => !idSet.has(edge.from) && !idSet.has(edge.to),
          ),
        });
        setSelectedNodeIds([]);
        setSelectedEdgeId(null);
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
      setSelectedNodeIds([]);
      return;
    }
    if (issue.blockId) {
      setSelectedNodeIds([issue.blockId]);
      setSelectedEdgeId(null);
    }
  };

  return (
    <section
      ref={panelRef}
      className={styles.panel}
      style={{ height }}
      data-behavior-editor="true"
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
            {scopeName}
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
            {editingFunction ? (
              <div className={styles.scopeBar}>
                <button
                  className={styles.scopeBack}
                  type="button"
                  onClick={() => {
                    const parent = editingFunction.scopeId ?? null;
                    setEditingFunctionId(parent);
                    setSelectedNodeIds(parent ? [parent] : []);
                    setSelectedEdgeId(null);
                  }}
                >
                  {t("projects.workspace.behavior.backToGraph")}
                </button>
                <span>
                  {editingFunction.text?.trim() ||
                    t("projects.workspace.behavior.blockTypes.function")}
                </span>
              </div>
            ) : null}
            {convertedPageId === scopeId ? (
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
              blocks={visibleBlocks}
              edges={visibleEdges}
              activeTool={activeTool}
              selectedNodeIds={selectedNodeIds}
              selectedEdgeId={selectedEdgeId}
              fitKey={`${scopeId}:${editingFunctionId ?? "main"}`}
              apiRef={graphApiRef}
              onSelectNodes={(ids) => {
                setSelectedNodeIds(ids);
                if (ids.length) setSelectedEdgeId(null);
              }}
              onSelectEdge={(id) => {
                setSelectedEdgeId(id);
                if (id) setSelectedNodeIds([]);
              }}
              onMoveNode={moveNode}
              onMoveNodes={moveNodes}
              onCreateEdge={addEdge}
              onDeleteEdge={deleteEdge}
              onDeleteNode={deleteNode}
              onCreateEvent={() =>
                addBlock({
                  type: "event",
                  event: "click",
                })
              }
              onCreateReference={createReference}
              onCreatePhrase={createPhrase}
              onAssignReference={assignReference}
              onOpenFunction={(functionId) => {
                setEditingFunctionId(functionId);
                setSelectedNodeIds([functionId]);
                setSelectedEdgeId(null);
              }}
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
            {inspectedBlock ? (
              <div className={styles.inspectorPane}>
                <BlockInspector
                  block={inspectedBlock}
                  pages={pages}
                  links={links}
                  behavior={behavior}
                  onChange={(patch) => patchBlock(inspectedBlock.id, patch)}
                  onRewrite={(patch, nextEdges) =>
                    updateGraph({
                      blocks: blocks.map((item) =>
                        item.id === inspectedBlock.id
                          ? { ...item, ...patch }
                          : item,
                      ),
                      edges: nextEdges,
                    })
                  }
                />
              </div>
            ) : null}
            <div className={styles.phraseList}>
              <PhraseButton
                kind="event"
                label={t("projects.workspace.behavior.phrases.eventGeneric")}
                onAdd={() => addBlock({ type: "event", event: "click" })}
              />
              <PhraseButton
                kind="condition"
                label={t("projects.workspace.behavior.phrases.judge")}
                onAdd={() => addConditionBlock("nodeText")}
              />
              <PhraseButton
                kind="action"
                label={t("projects.workspace.behavior.phrases.modify")}
                onAdd={() => addActionBlock("setText")}
              />
              <PhraseButton
                kind="data"
                label={t("projects.workspace.behavior.phrases.modifyData")}
                onAdd={() => addActionBlock("setData")}
              />
              <PhraseButton
                kind="apply"
                label={t("projects.workspace.behavior.phrases.apply")}
                onAdd={() => addActionBlock("apply")}
              />
              <PhraseButton
                kind="switch"
                label={t("projects.workspace.behavior.phrases.switch")}
                onAdd={() => addBlock({ type: "switch" })}
              />
              <PhraseButton
                kind="function"
                label={t("projects.workspace.behavior.phrases.function")}
                onAdd={() => addBlock({ type: "function", text: "函数" })}
              />
              <PhraseButton
                kind="call"
                label={t("projects.workspace.behavior.phrases.call")}
                onAdd={() => addBlock({ type: "call" })}
              />
              <PhraseButton
                kind="navigate"
                label={t("projects.workspace.behavior.phrases.navigate")}
                onAdd={() => addActionBlock("navigate")}
              />
            </div>
          </aside>
        </div>
    </section>
  );
}
