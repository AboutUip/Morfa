import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import {
  ChevronDownIcon,
  CloseIcon,
  DatabaseIcon,
  LayersIcon,
  PageIcon,
  SlidersIcon,
} from "../../components/icons";
import {
  CANVAS_DATA_TYPES,
  createDefaultDataValue,
  getInheritedPageData,
  getPageData,
  isPageSeeThrough,
  withPageSeeThrough,
  type CanvasDataEntry,
  type CanvasDataType,
  type CanvasLink,
  type CanvasPage,
  type CanvasWidget,
} from "./canvasDocument";
import {
  WIDGET_SOURCE_KINDS,
  WIDGET_TEXT_KINDS,
  WIDGET_VALUE_KINDS,
  WIDGET_VARIANT_OPTIONS,
} from "./CanvasWidgetView";
import styles from "./CanvasRightSidebar.module.css";

const DEFAULT_PANEL_WIDTH = 320;
const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = 640;
const RESIZE_STEP = 16;
const PANEL_ANIMATION_MS = 200;
const PANEL_ID = "canvas-inspector-panel";
const LAYER_DRAG_MIME = "application/x-morfa-layer";

type RightPanel = "layers" | "properties" | "data";
type PropertyTab = "style" | "behavior";
type DropPosition = "before" | "after";

const PANEL_ITEMS = [
  { id: "layers", Icon: LayersIcon },
  { id: "properties", Icon: SlidersIcon },
  { id: "data", Icon: DatabaseIcon },
] as const;

const PANEL_LABEL_KEYS: Record<RightPanel, string> = {
  layers: "projects.workspace.rightPanels.layers",
  properties: "projects.workspace.rightPanels.properties",
  data: "projects.workspace.rightPanels.data",
};

const DATA_TYPE_LABEL_KEYS: Record<CanvasDataType, string> = {
  text: "projects.workspace.dataPanel.types.text",
  number: "projects.workspace.dataPanel.types.number",
  color: "projects.workspace.dataPanel.types.color",
  date: "projects.workspace.dataPanel.types.date",
  boolean: "projects.workspace.dataPanel.types.boolean",
};

interface ResizeSession {
  pointerId: number;
  startX: number;
  startWidth: number;
}

interface CanvasRightSidebarProps {
  pages: CanvasPage[];
  links: CanvasLink[];
  selectedId: string | null;
  selectedIds: string[];
  selectedLink: CanvasLink | null;
  onSelect: (pageId: string | null) => void;
  onUpdateLink: (linkId: string, patch: Partial<CanvasLink>) => void;
  onDeleteLink: (linkId: string) => void;
  onRename: (pageId: string, name: string) => void;
  onRenameId: (pageId: string, nextId: string) => void;
  onDelete: (pageId: string) => void;
  onUpdateStyles: (
    pageId: string,
    styles: Record<string, string>,
  ) => void;
  onUpdateWidget: (pageId: string, widget: CanvasWidget | null) => void;
  onUpdateData: (pageId: string, data: CanvasDataEntry[]) => void;
  onReorder: (
    dragId: string,
    targetId: string,
    position: DropPosition,
  ) => void;
}

interface ContextMenuState {
  pageId: string;
  x: number;
  y: number;
}

interface DropTargetState {
  pageId: string;
  position: DropPosition;
}

function clampWidth(width: number) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
}

function readNumericDraft(
  value: string | undefined,
  unit: string,
) {
  if (!value) return "";
  const trimmed = value.trim();

  if (unit && trimmed.endsWith(unit)) {
    const body = trimmed.slice(0, -unit.length).trim();
    if (
      body &&
      (body.includes("${") || /^-?\d*\.?\d+$/.test(body))
    ) {
      return body;
    }
  }

  if (trimmed.includes("${")) return trimmed;

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) && /^-?\d*\.?\d+$/.test(trimmed)
    ? String(parsed)
    : trimmed;
}

function formatNumericValue(draft: string, unit: string) {
  const trimmed = draft.trim();
  if (!trimmed) return "";

  const hasSuffix =
    /[a-z%]$/i.test(trimmed) || trimmed.endsWith(")");
  return hasSuffix ? trimmed : `${trimmed}${unit}`;
}

function toHexColor(value: string | undefined) {
  if (!value) return "#ffffff";
  const input = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(input)) return input;
  if (/^#[0-9a-f]{3}$/i.test(input)) {
    return `#${input[1]}${input[1]}${input[2]}${input[2]}${input[3]}${input[3]}`;
  }
  return "#ffffff";
}

function useDraftValue(
  value: string,
  onCommit: (value: string) => void,
) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value);
    }
  }, [value]);

  const handleFocus = () => {
    focusedRef.current = true;
    cancelRef.current = false;
  };

  const handleBlur = () => {
    focusedRef.current = false;

    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(value);
      return;
    }

    if (draft !== value) {
      onCommit(draft);
    }
  };

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelRef.current = true;
      setDraft(value);
      event.currentTarget.blur();
    }
  };

  return {
    value: draft,
    setValue: setDraft,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  };
}

function NumberControl({
  label,
  value,
  onChange,
  unit = "px",
  min,
  max,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const draft = useDraftValue(
    readNumericDraft(value, unit),
    (next) => onChange(formatNumericValue(next, unit)),
  );

  return (
    <div className={styles.controlRow}>
      <span className={styles.controlLabel}>{label}</span>
      <span className={styles.inputWrap}>
        <input
          className={styles.controlInput}
          type="text"
          value={draft.value}
          min={min}
          max={max}
          step={step}
          placeholder={t("projects.workspace.propertiesPanel.inherit")}
          disabled={disabled}
          onChange={(event) => draft.setValue(event.target.value)}
          onFocus={draft.onFocus}
          onBlur={draft.onBlur}
          onKeyDown={draft.onKeyDown}
        />
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </span>
    </div>
  );
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const draft = useDraftValue(value ?? "", onChange);

  return (
    <div className={styles.controlRow}>
      <span className={styles.controlLabel}>{label}</span>
      <span className={styles.colorRow}>
        <input
          className={styles.colorInput}
          type="color"
          value={toHexColor(draft.value)}
          aria-label={label}
          onChange={(event) => {
            draft.setValue(event.target.value);
            onChange(event.target.value);
          }}
        />
        <input
          className={styles.controlInput}
          value={draft.value}
          placeholder={t("projects.workspace.propertiesPanel.inherit")}
          onChange={(event) => draft.setValue(event.target.value)}
          onFocus={draft.onFocus}
          onBlur={draft.onBlur}
          onKeyDown={draft.onKeyDown}
        />
      </span>
    </div>
  );
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const draft = useDraftValue(value ?? "", onChange);

  return (
    <div className={styles.controlRow}>
      <span className={styles.controlLabel}>{label}</span>
      <input
        className={styles.controlInput}
        list={listId}
        value={draft.value}
        placeholder={t("projects.workspace.propertiesPanel.inherit")}
        aria-label={label}
        onChange={(event) => draft.setValue(event.target.value)}
        onFocus={draft.onFocus}
        onBlur={draft.onBlur}
        onKeyDown={draft.onKeyDown}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}

function TextControl({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const draft = useDraftValue(value ?? "", onChange);

  return (
    <div className={styles.controlRow}>
      <span className={styles.controlLabel}>{label}</span>
      <input
        className={styles.controlInput}
        value={draft.value}
        placeholder={placeholder}
        onChange={(event) => draft.setValue(event.target.value)}
        onFocus={draft.onFocus}
        onBlur={draft.onBlur}
        onKeyDown={draft.onKeyDown}
      />
    </div>
  );
}

function StyleTableValue({
  value,
  ariaLabel,
  disabled = false,
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const draft = useDraftValue(value, onCommit);

  return (
    <input
      className={styles.styleValueInput}
      value={draft.value}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(event) => draft.setValue(event.target.value)}
      onFocus={draft.onFocus}
      onBlur={draft.onBlur}
      onKeyDown={draft.onKeyDown}
    />
  );
}

function ControlSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.controlSection}>
      <h3>{title}</h3>
      <div className={styles.controlList}>{children}</div>
    </section>
  );
}

function LayersPanel({
  pages,
  selectedIds,
  onSelect,
  onRename,
  onDelete,
  onReorder,
}: {
  pages: CanvasPage[];
  selectedIds: string[];
  onSelect: (pageId: string | null) => void;
  onRename: (pageId: string, name: string) => void;
  onDelete: (pageId: string) => void;
  onReorder: (
    dragId: string,
    targetId: string,
    position: DropPosition,
  ) => void;
}) {
  const { t } = useTranslation();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [contextMenu, setContextMenu] =
    useState<ContextMenuState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] =
    useState<DropTargetState | null>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const toggleExpanded = (pageId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const startRename = (page: CanvasPage) => {
    setEditingId(page.id);
    setDraftName(page.name);
    setContextMenu(null);
  };

  const commitRename = (page: CanvasPage) => {
    if (editingId !== page.id) return;
    const name = draftName.trim();
    if (name && name !== page.name) onRename(page.id, name);
    setEditingId(null);
    setDraftName("");
  };

  const handleRenameKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    page: CanvasPage,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename(page);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditingId(null);
      setDraftName("");
    }
  };

  const openContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    page: CanvasPage,
  ) => {
    event.preventDefault();
    onSelect(page.id);
    const menuWidth = 160;
    const menuHeight = 82;
    setContextMenu({
      pageId: page.id,
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    });
  };

  const handleDragStart = (
    event: ReactDragEvent<HTMLDivElement>,
    page: CanvasPage,
  ) => {
    event.dataTransfer.setData(LAYER_DRAG_MIME, page.id);
    event.dataTransfer.setData("text/plain", page.name);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(page.id);
  };

  const handleDragOver = (
    event: ReactDragEvent<HTMLDivElement>,
    page: CanvasPage,
  ) => {
    if (!draggingId || draggingId === page.id) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const position: DropPosition =
      event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDropTarget({ pageId: page.id, position });
  };

  const clearDragState = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleDrop = (
    event: ReactDragEvent<HTMLDivElement>,
    page: CanvasPage,
  ) => {
    event.preventDefault();
    const dragId =
      event.dataTransfer.getData(LAYER_DRAG_MIME) || draggingId;
    if (!dragId || dragId === page.id) {
      clearDragState();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const position: DropPosition =
      event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    onReorder(dragId, page.id, position);
    clearDragState();
  };

  const menuPage = contextMenu
    ? pages.find((page) => page.id === contextMenu.pageId) ?? null
    : null;

  return (
    <div
      className={styles.layerList}
      role="tree"
      aria-label={t("projects.workspace.rightPanels.layers")}
    >
      {pages.map((page) => {
        const expanded = expandedIds.has(page.id);
        const selected = selectedIds.includes(page.id);
        const dropPosition =
          dropTarget?.pageId === page.id ? dropTarget.position : null;

        return (
          <div key={page.id} className={styles.layerNode}>
            <div
              className={styles.layerRow}
              role="treeitem"
              aria-expanded={expanded}
              aria-selected={selected}
              data-selected={selected}
              data-drop-position={dropPosition ?? undefined}
              draggable={editingId !== page.id}
              tabIndex={0}
              onClick={() => {
                if (editingId === page.id) return;
                onSelect(page.id);
                toggleExpanded(page.id);
              }}
              onContextMenu={(event) => openContextMenu(event, page)}
              onDragStart={(event) => handleDragStart(event, page)}
              onDragOver={(event) => handleDragOver(event, page)}
              onDragLeave={(event) => {
                const next = event.relatedTarget as Node | null;
                if (
                  !next ||
                  !event.currentTarget.contains(next)
                ) {
                  setDropTarget((current) =>
                    current?.pageId === page.id ? null : current,
                  );
                }
              }}
              onDrop={(event) => handleDrop(event, page)}
              onDragEnd={clearDragState}
            >
              <ChevronDownIcon
                size={10}
                className={expanded ? styles.chevronOpen : styles.chevron}
              />
              <PageIcon size={13} />

              {editingId === page.id ? (
                <input
                  className={styles.renameInput}
                  value={draftName}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={() => commitRename(page)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) =>
                    handleRenameKeyDown(event, page)
                  }
                />
              ) : (
                <span className={styles.layerName}>{page.name}</span>
              )}
            </div>

            {expanded ? (
              <div className={styles.layerChildren} role="group" />
            ) : null}
          </div>
        );
      })}

      {contextMenu && menuPage
        ? createPortal(
            <div
              className={styles.contextMenu}
              style={{ left: contextMenu.x, top: contextMenu.y }}
              role="menu"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                className={styles.contextMenuItem}
                type="button"
                role="menuitem"
                autoFocus
                onClick={() => startRename(menuPage)}
              >
                {t("projects.workspace.layersPanel.rename")}
              </button>
              <button
                className={styles.contextMenuItem}
                type="button"
                role="menuitem"
                data-danger="true"
                onClick={() => {
                  onDelete(menuPage.id);
                  setContextMenu(null);
                }}
              >
                {t("projects.workspace.layersPanel.delete")}
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function NodeIdControl({
  page,
  pages,
  onRenameId,
}: {
  page: CanvasPage;
  pages: CanvasPage[];
  onRenameId: (pageId: string, nextId: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(page.id);
  const [error, setError] = useState("");
  const focusedRef = useRef(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(page.id);
  }, [page.id]);

  const validate = (value: string) => {
    const id = value.trim();
    if (!id) {
      return "projects.workspace.propertiesPanel.nodeIdErrors.required";
    }
    if (id.toLowerCase() === "self") {
      return "projects.workspace.propertiesPanel.nodeIdErrors.reserved";
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      return "projects.workspace.propertiesPanel.nodeIdErrors.format";
    }
    if (
      pages.some((item) => item.id === id && item.id !== page.id)
    ) {
      return "projects.workspace.propertiesPanel.nodeIdErrors.duplicate";
    }
    return "";
  };

  const commit = () => {
    const id = draft.trim();
    const nextError = validate(id);

    if (nextError) {
      setError(nextError);
      setDraft(page.id);
      return;
    }

    setError("");
    if (id !== page.id) onRenameId(page.id, id);
  };

  return (
    <div className={styles.nodeIdBlock}>
      <div className={styles.controlRow}>
        <span className={styles.controlLabel}>
          {t("projects.workspace.propertiesPanel.fields.nodeId")}
        </span>
        <input
          className={`${styles.controlInput} ${styles.nodeIdInput}`}
          value={draft}
          maxLength={64}
          spellCheck={false}
          autoComplete="off"
          aria-label={t(
            "projects.workspace.propertiesPanel.fields.nodeId",
          )}
          onFocus={(event) => {
            focusedRef.current = true;
            cancelRef.current = false;
            setError("");
            event.currentTarget.select();
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            focusedRef.current = false;
            if (cancelRef.current) {
              cancelRef.current = false;
              setDraft(page.id);
              setError("");
              return;
            }
            commit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              cancelRef.current = true;
              setDraft(page.id);
              setError("");
              event.currentTarget.blur();
            }
          }}
        />
      </div>

      {error ? <p className={styles.nodeIdError}>{t(error)}</p> : null}

      <p className={styles.nodeIdHint}>
        {t("projects.workspace.propertiesPanel.nodeIdHint")}
      </p>
    </div>
  );
}

function PropertiesPanel({
  pages,
  page,
  onRename,
  onRenameId,
  onUpdateStyles,
  onUpdateWidget,
}: {
  pages: CanvasPage[];
  page: CanvasPage | null;
  onRename: (pageId: string, name: string) => void;
  onRenameId: (pageId: string, nextId: string) => void;
  onUpdateStyles: (
    pageId: string,
    styles: Record<string, string>,
  ) => void;
  onUpdateWidget: (pageId: string, widget: CanvasWidget | null) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PropertyTab>("style");
  const [tableMode, setTableMode] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const renameCancelRef = useRef(false);

  const startRename = () => {
    if (!page) return;
    setRenameDraft(page.name);
    setRenaming(true);
  };

  const commitRename = () => {
    if (!page || !renaming) return;
    const name = renameDraft.trim();
    if (name && name !== page.name) onRename(page.id, name);
    setRenaming(false);
    setRenameDraft("");
  };

  const handleRenameKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      renameCancelRef.current = true;
      event.currentTarget.blur();
    }
  };

  const updateStyle = (key: string, value: string) => {
    if (!page) return;
    onUpdateStyles(page.id, { ...page.styles, [key]: value });
  };

  const removeStyle = (key: string) => {
    if (!page) return;
    const next = { ...page.styles };
    delete next[key];
    onUpdateStyles(page.id, next);
  };

  const addStyle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = newKey.trim();
    if (!key) return;
    if (
      page?.lockedSize &&
      (key === "width" || key === "height")
    ) {
      return;
    }
    updateStyle(key, newValue);
    setNewKey("");
    setNewValue("");
  };

  const inherit = t("projects.workspace.propertiesPanel.inherit");
  const seeThrough = page ? isPageSeeThrough(page) : false;
  const widget = page?.widget ?? null;
  const widgetVariantOptions = widget
    ? WIDGET_VARIANT_OPTIONS[widget.kind]
    : undefined;
  const widgetHasText = Boolean(
    widget &&
      WIDGET_TEXT_KINDS.has(widget.kind) &&
      !(widget.kind === "button" && widget.variant === "icon"),
  );
  const widgetHasValue = Boolean(
    widget && WIDGET_VALUE_KINDS.has(widget.kind),
  );
  const widgetHasSource = Boolean(
    widget && WIDGET_SOURCE_KINDS.has(widget.kind),
  );
  const hasWidgetControls = Boolean(
    widgetVariantOptions || widgetHasText || widgetHasValue || widgetHasSource,
  );

  const updateWidget = (patch: Partial<CanvasWidget>) => {
    if (!page?.widget) return;
    onUpdateWidget(page.id, { ...page.widget, ...patch });
  };

  const toggleSeeThrough = () => {
    if (!page) return;
    onUpdateStyles(
      page.id,
      withPageSeeThrough(page.styles, !seeThrough),
    );
  };

  return (
    <div className={styles.propertiesPanel}>
      <div
        className={styles.propertyTabs}
        role="tablist"
        aria-label={t("projects.workspace.rightPanels.properties")}
      >
        <button
          className={styles.propertyTab}
          type="button"
          role="tab"
          aria-selected={tab === "style"}
          data-active={tab === "style"}
          onClick={() => setTab("style")}
        >
          {t("projects.workspace.propertiesPanel.tabs.style")}
        </button>
        <button
          className={styles.propertyTab}
          type="button"
          role="tab"
          aria-selected={tab === "behavior"}
          data-active={tab === "behavior"}
          onClick={() => setTab("behavior")}
        >
          {t("projects.workspace.propertiesPanel.tabs.behavior")}
        </button>
      </div>

      {tab === "style" ? (
        <div className={styles.propertyBody}>
          {page ? (
            <>
              <div className={styles.propertyToolbar}>
                {renaming ? (
                  <input
                    className={styles.pageRenameInput}
                    value={renameDraft}
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      setRenameDraft(event.target.value)
                    }
                    onBlur={() => {
                      if (renameCancelRef.current) {
                        renameCancelRef.current = false;
                        setRenaming(false);
                        setRenameDraft("");
                        return;
                      }
                      commitRename();
                    }}
                    onKeyDown={handleRenameKeyDown}
                  />
                ) : (
                  <button
                    className={styles.selectedNameButton}
                    type="button"
                    title={t("projects.workspace.layersPanel.rename")}
                    onClick={startRename}
                  >
                    {page.name}
                  </button>
                )}
                <button
                  className={styles.modeButton}
                  type="button"
                  onClick={() => setTableMode((current) => !current)}
                >
                  {tableMode
                    ? t("projects.workspace.propertiesPanel.controlMode")
                    : t("projects.workspace.propertiesPanel.tableMode")}
                </button>
              </div>

              <NodeIdControl
                page={page}
                pages={pages}
                onRenameId={onRenameId}
              />

              <div className={styles.propertyQuickRow}>
                <span className={styles.propertyQuickLabel}>
                  {t("projects.workspace.propertiesPanel.seeThrough")}
                </span>
                <button
                  className={styles.propertySwitch}
                  type="button"
                  role="switch"
                  aria-checked={seeThrough}
                  aria-label={t(
                    "projects.workspace.propertiesPanel.seeThrough",
                  )}
                  data-checked={seeThrough}
                  onClick={toggleSeeThrough}
                >
                  <span className={styles.propertySwitchThumb} />
                </button>
              </div>

              {widget && hasWidgetControls ? (
                <ControlSection
                  title={t(
                    "projects.workspace.propertiesPanel.sections.widget",
                  )}
                >
                  {widgetVariantOptions ? (
                    <SelectControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.widgetVariant",
                      )}
                      value={widget.variant}
                      options={widgetVariantOptions}
                      onChange={(variant) => updateWidget({ variant })}
                    />
                  ) : null}
                  {widgetHasText ? (
                    <TextControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.widgetText",
                      )}
                      value={widget.text}
                      placeholder={t(
                        "projects.workspace.propertiesPanel.widgetTextPlaceholder",
                      )}
                      onChange={(text) => updateWidget({ text })}
                    />
                  ) : null}
                  {widgetHasValue ? (
                    <NumberControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.widgetValue",
                      )}
                      value={String(widget.value ?? 50)}
                      unit="%"
                      min={0}
                      max={100}
                      onChange={(value) => {
                        const parsed = Number.parseFloat(value);
                        updateWidget({
                          value: Number.isFinite(parsed)
                            ? Math.min(100, Math.max(0, parsed))
                            : 0,
                        });
                      }}
                    />
                  ) : null}
                  {widgetHasSource ? (
                    <TextControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.widgetSource",
                      )}
                      value={widget.src}
                      placeholder={t(
                        "projects.workspace.propertiesPanel.widgetSourcePlaceholder",
                      )}
                      onChange={(src) => updateWidget({ src })}
                    />
                  ) : null}
                </ControlSection>
              ) : null}

              {tableMode ? (
                <div className={styles.styleTable}>
                  <div className={styles.styleTableHeader}>
                    <span>
                      {t("projects.workspace.propertiesPanel.table.property")}
                    </span>
                    <span>
                      {t("projects.workspace.propertiesPanel.table.value")}
                    </span>
                    <span />
                  </div>

                  {Object.entries(page.styles).map(([key, value]) => {
                    const sizeLocked =
                      page.lockedSize &&
                      (key === "width" || key === "height");

                    return (
                      <div className={styles.styleTableRow} key={key}>
                        <code className={styles.styleKey}>{key}</code>
                        <StyleTableValue
                          value={value}
                          ariaLabel={key}
                          disabled={sizeLocked}
                          onCommit={(next) => updateStyle(key, next)}
                        />
                        <button
                          className={styles.removeStyle}
                          type="button"
                          aria-label={t(
                            "projects.workspace.propertiesPanel.table.remove",
                          )}
                          disabled={sizeLocked}
                          onClick={() => removeStyle(key)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}

                  <p className={styles.styleHint}>
                    {t(
                      "projects.workspace.propertiesPanel.table.inheritHint",
                    )}
                  </p>

                  <form className={styles.styleAdd} onSubmit={addStyle}>
                    <input
                      className={styles.styleValueInput}
                      value={newKey}
                      placeholder={t(
                        "projects.workspace.propertiesPanel.table.addProperty",
                      )}
                      onChange={(event) => setNewKey(event.target.value)}
                    />
                    <input
                      className={styles.styleValueInput}
                      value={newValue}
                      placeholder={t(
                        "projects.workspace.propertiesPanel.table.addValue",
                      )}
                      onChange={(event) => setNewValue(event.target.value)}
                    />
                    <button
                      className={styles.addStyle}
                      type="submit"
                      aria-label={t(
                        "projects.workspace.propertiesPanel.table.add",
                      )}
                    >
                      +
                    </button>
                  </form>
                </div>
              ) : (
                <div className={styles.controlSections}>
                  <ControlSection
                    title={t(
                      "projects.workspace.propertiesPanel.sections.layout",
                    )}
                  >
                    <NumberControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.width",
                      )}
                      value={page.styles.width}
                      disabled={page.lockedSize}
                      onChange={(value) => updateStyle("width", value)}
                    />
                    <NumberControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.height",
                      )}
                      value={page.styles.height}
                      disabled={page.lockedSize}
                      onChange={(value) => updateStyle("height", value)}
                    />
                    {page.lockedSize ? (
                      <p className={styles.lockHint}>
                        {t(
                          "projects.workspace.propertiesPanel.sizeLocked",
                        )}
                      </p>
                    ) : null}
                    <SelectControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.display",
                      )}
                      value={page.styles.display}
                      options={["block", "flex", "grid", "none"]}
                      onChange={(value) => updateStyle("display", value)}
                    />
                    <SelectControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.overflow",
                      )}
                      value={page.styles.overflow}
                      options={["visible", "hidden", "auto", "scroll"]}
                      onChange={(value) => updateStyle("overflow", value)}
                    />
                    <SelectControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.boxSizing",
                      )}
                      value={page.styles["box-sizing"]}
                      options={["border-box", "content-box"]}
                      onChange={(value) =>
                        updateStyle("box-sizing", value)
                      }
                    />
                  </ControlSection>

                  <ControlSection
                    title={t(
                      "projects.workspace.propertiesPanel.sections.spacing",
                    )}
                  >
                    <NumberControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.padding",
                      )}
                      value={page.styles.padding}
                      onChange={(value) => updateStyle("padding", value)}
                    />
                    <NumberControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.gap",
                      )}
                      value={page.styles.gap}
                      onChange={(value) => updateStyle("gap", value)}
                    />
                  </ControlSection>

                  <ControlSection
                    title={t(
                      "projects.workspace.propertiesPanel.sections.appearance",
                    )}
                  >
                    <ColorControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.background",
                      )}
                      value={page.styles["background-color"]}
                      onChange={(value) =>
                        updateStyle("background-color", value)
                      }
                    />
                    <NumberControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.opacity",
                      )}
                      value={page.styles.opacity}
                      unit=""
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(value) => updateStyle("opacity", value)}
                    />
                    <NumberControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.radius",
                      )}
                      value={page.styles["border-radius"]}
                      onChange={(value) =>
                        updateStyle("border-radius", value)
                      }
                    />
                  </ControlSection>

                  <ControlSection
                    title={t(
                      "projects.workspace.propertiesPanel.sections.border",
                    )}
                  >
                    <NumberControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.borderWidth",
                      )}
                      value={page.styles["border-width"]}
                      onChange={(value) =>
                        updateStyle("border-width", value)
                      }
                    />
                    <SelectControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.borderStyle",
                      )}
                      value={page.styles["border-style"]}
                      options={["none", "solid", "dashed", "dotted"]}
                      onChange={(value) =>
                        updateStyle("border-style", value)
                      }
                    />
                    <ColorControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.borderColor",
                      )}
                      value={page.styles["border-color"]}
                      onChange={(value) =>
                        updateStyle("border-color", value)
                      }
                    />
                  </ControlSection>

                  <ControlSection
                    title={t(
                      "projects.workspace.propertiesPanel.sections.flex",
                    )}
                  >
                    <SelectControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.flexDirection",
                      )}
                      value={page.styles["flex-direction"]}
                      options={[
                        "row",
                        "column",
                        "row-reverse",
                        "column-reverse",
                      ]}
                      onChange={(value) =>
                        updateStyle("flex-direction", value)
                      }
                    />
                    <SelectControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.justifyContent",
                      )}
                      value={page.styles["justify-content"]}
                      options={[
                        "flex-start",
                        "center",
                        "flex-end",
                        "space-between",
                        "space-around",
                        "space-evenly",
                      ]}
                      onChange={(value) =>
                        updateStyle("justify-content", value)
                      }
                    />
                    <SelectControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.alignItems",
                      )}
                      value={page.styles["align-items"]}
                      options={[
                        "stretch",
                        "flex-start",
                        "center",
                        "flex-end",
                        "baseline",
                      ]}
                      onChange={(value) =>
                        updateStyle("align-items", value)
                      }
                    />
                  </ControlSection>

                  <ControlSection
                    title={t(
                      "projects.workspace.propertiesPanel.sections.effects",
                    )}
                  >
                    <TextControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.boxShadow",
                      )}
                      value={page.styles["box-shadow"]}
                      placeholder={inherit}
                      onChange={(value) =>
                        updateStyle("box-shadow", value)
                      }
                    />
                    <TextControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.filter",
                      )}
                      value={page.styles.filter}
                      placeholder={inherit}
                      onChange={(value) => updateStyle("filter", value)}
                    />
                  </ControlSection>
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : (
        <div className={styles.propertyBody} />
      )}
    </div>
  );
}

function DataValuePreview({ entry }: { entry: CanvasDataEntry }) {
  const { t } = useTranslation();

  if (entry.type === "color") {
    return (
      <span className={styles.dataValuePreview}>
        <span
          className={styles.dataColorSwatch}
          style={{ background: toHexColor(entry.value) }}
          aria-hidden="true"
        />
        <span className={styles.dataValueText}>{entry.value || "—"}</span>
      </span>
    );
  }

  const text =
    entry.type === "boolean"
      ? entry.value === "true"
        ? t("projects.workspace.dataPanel.boolean.true")
        : t("projects.workspace.dataPanel.boolean.false")
      : entry.value;

  return (
    <span className={styles.dataValuePreview}>
      <span className={styles.dataValueText}>{text || "—"}</span>
    </span>
  );
}

function DataValueInput({
  type,
  value,
  onChange,
}: {
  type: CanvasDataType | "";
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const label = t("projects.workspace.dataPanel.fields.value");

  if (!type) {
    return (
      <input
        className={styles.controlInput}
        value=""
        placeholder={t("projects.workspace.dataPanel.placeholders.typeFirst")}
        aria-label={label}
        disabled
      />
    );
  }

  if (type === "color") {
    return (
      <span className={styles.colorRow}>
        <input
          className={styles.colorInput}
          type="color"
          value={toHexColor(value)}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          className={styles.controlInput}
          value={value}
          maxLength={32}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    );
  }

  if (type === "boolean") {
    return (
      <select
        className={styles.selectInput}
        value={value === "true" ? "true" : "false"}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="true">
          {t("projects.workspace.dataPanel.boolean.true")}
        </option>
        <option value="false">
          {t("projects.workspace.dataPanel.boolean.false")}
        </option>
      </select>
    );
  }

  return (
    <input
      className={styles.controlInput}
      type={
        type === "number" ? "number" : type === "date" ? "date" : "text"
      }
      value={value}
      maxLength={type === "number" ? undefined : 2000}
      placeholder={
        type === "text" || type === "number"
          ? t("projects.workspace.dataPanel.placeholders.value")
          : undefined
      }
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function DataPanel({
  pages,
  links,
  page,
  onUpdateData,
}: {
  pages: CanvasPage[];
  links: CanvasLink[];
  page: CanvasPage | null;
  onUpdateData: (pageId: string, data: CanvasDataEntry[]) => void;
}) {
  const { t } = useTranslation();
  const [draftKey, setDraftKey] = useState("");
  const [draftType, setDraftType] = useState<CanvasDataType | "">("");
  const [draftValue, setDraftValue] = useState("");
  const [draftCommit, setDraftCommit] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dataMenu, setDataMenu] = useState<{
    key: string;
    x: number;
    y: number;
  } | null>(null);

  const pageId = page?.id ?? null;

  useEffect(() => {
    setDraftKey("");
    setDraftType("");
    setDraftValue("");
    setDraftCommit("");
    setEditingKey(null);
    setError("");
    setDialogOpen(false);
    setDataMenu(null);
  }, [pageId]);

  useEffect(() => {
    if (!dataMenu) return;

    const closeMenu = () => setDataMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", closeMenu, { passive: true });
    window.addEventListener("resize", closeMenu);

    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, [dataMenu]);

  useEffect(() => {
    if (!dialogOpen) return;

    document.body.dataset.canvasModal = "true";
    return () => {
      delete document.body.dataset.canvasModal;
    };
  }, [dialogOpen]);

  const pageData = page ? getPageData(page) : [];
  const inheritedData = page
    ? getInheritedPageData(pages, links, page)
    : [];

  const resetDraft = () => {
    setDraftKey("");
    setDraftType("");
    setDraftValue("");
    setDraftCommit("");
    setEditingKey(null);
    setError("");
  };

  if (!page) {
    return (
      <div className={styles.dataPanel}>
        <p className={styles.dataEmpty}>
          {t("projects.workspace.dataPanel.noSelection")}
        </p>
      </div>
    );
  }

  const handleTypeChange = (nextType: string) => {
    const type = nextType as CanvasDataType | "";
    setDraftType(type);
    setDraftValue(type ? createDefaultDataValue(type) : "");
    setError("");
  };

  const commitDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = draftKey.trim();

    if (!key) {
      setError("projects.workspace.dataPanel.errors.keyRequired");
      return;
    }

    if (!draftType) {
      setError("projects.workspace.dataPanel.errors.typeRequired");
      return;
    }

    if (
      pageData.some(
        (entry) => entry.key === key && entry.key !== editingKey,
      )
    ) {
      setError("projects.workspace.dataPanel.errors.keyDuplicate");
      return;
    }

    const commit = draftCommit.trim();
    const entry: CanvasDataEntry = {
      key,
      type: draftType,
      value: draftValue,
      ...(commit ? { commit } : {}),
    };
    const editingIndex =
      editingKey === null
        ? -1
        : pageData.findIndex((item) => item.key === editingKey);
    const nextData =
      editingIndex >= 0
        ? pageData.map((item, index) =>
            index === editingIndex ? entry : item,
          )
        : [...pageData, entry];

    onUpdateData(page.id, nextData);
    setDialogOpen(false);
    resetDraft();
  };

  const openAddDialog = () => {
    resetDraft();
    setDialogOpen(true);
  };

  const openEditDialog = (entry: CanvasDataEntry) => {
    setEditingKey(entry.key);
    setDraftKey(entry.key);
    setDraftType(entry.type);
    setDraftValue(entry.value);
    setDraftCommit(entry.commit ?? "");
    setError("");
    setDataMenu(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetDraft();
  };

  const removeEntry = (key: string) => {
    onUpdateData(
      page.id,
      pageData.filter((entry) => entry.key !== key),
    );
    if (editingKey === key) resetDraft();
  };

  const openDataMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    key: string,
  ) => {
    event.preventDefault();
    setDataMenu({
      key,
      x: Math.max(
        8,
        Math.min(event.clientX, window.innerWidth - 172),
      ),
      y: Math.max(
        8,
        Math.min(event.clientY, window.innerHeight - 88),
      ),
    });
  };

  return (
    <div className={styles.dataPanel}>
      <div className={styles.dataPageName}>{page.name}</div>

      <section className={styles.dataSection}>
        <div className={styles.dataSectionHeader}>
          <span>{t("projects.workspace.dataPanel.current")}</span>
          <span className={styles.dataCount}>{pageData.length}</span>
        </div>

        <button
          className={styles.dataAddButton}
          type="button"
          onClick={openAddDialog}
        >
          <span aria-hidden="true">+</span>
          {t("projects.workspace.dataPanel.add")}
        </button>

        {pageData.length ? (
          <div className={styles.dataList}>
            {pageData.map((entry) => (
              <div
                className={styles.dataRow}
                key={entry.key}
                data-editing={editingKey === entry.key}
                title={entry.commit || undefined}
                onContextMenu={(event) =>
                  openDataMenu(event, entry.key)
                }
              >
                <div className={styles.dataRowMain}>
                  <code className={styles.dataKey}>{entry.key}</code>
                  <span className={styles.dataTypeBadge}>
                    {t(DATA_TYPE_LABEL_KEYS[entry.type])}
                  </span>
                  {entry.commit ? (
                    <span
                      className={styles.dataCommitDot}
                      title={entry.commit}
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
                <div className={styles.dataRowBottom}>
                  <DataValuePreview entry={entry} />
                  <span className={styles.dataActions}>
                    <button
                      className={styles.dataEditButton}
                      type="button"
                      onClick={() => openEditDialog(entry)}
                    >
                      {t("projects.workspace.dataPanel.actions.edit")}
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.dataEmpty}>
            {t("projects.workspace.dataPanel.empty")}
          </p>
        )}

        {pageData.length ? (
          <p className={styles.dataHint}>
            {t("projects.workspace.dataPanel.rowHint")}
          </p>
        ) : null}
      </section>

      <section className={styles.dataSection}>
        <div className={styles.dataSectionHeader}>
          <span>{t("projects.workspace.dataPanel.inherited")}</span>
          <span className={styles.dataCount}>{inheritedData.length}</span>
        </div>

        {inheritedData.length ? (
          <div className={styles.dataList}>
            {inheritedData.map((entry) => (
              <div
                className={styles.dataRow}
                key={`${entry.sourceId}:${entry.key}`}
                data-shadowed={entry.shadowed}
                title={entry.commit || undefined}
              >
                <div className={styles.dataRowMain}>
                  <code className={styles.dataKey}>{entry.key}</code>
                  <span className={styles.dataTypeBadge}>
                    {t(DATA_TYPE_LABEL_KEYS[entry.type])}
                  </span>
                  {entry.commit ? (
                    <span
                      className={styles.dataCommitDot}
                      title={entry.commit}
                      aria-hidden="true"
                    />
                  ) : null}
                  {entry.shadowed ? (
                    <span className={styles.dataShadowed}>
                      {t("projects.workspace.dataPanel.shadowed")}
                    </span>
                  ) : null}
                </div>
                <div className={styles.dataRowBottom}>
                  <DataValuePreview entry={entry} />
                  <span className={styles.dataSource}>
                    {t("projects.workspace.dataPanel.source", {
                      name: entry.sourceName,
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.dataEmpty}>
            {t("projects.workspace.dataPanel.inheritedEmpty")}
          </p>
        )}

        <p className={styles.dataHint}>
          {t("projects.workspace.dataPanel.inheritHint")}
        </p>
      </section>

      {dialogOpen
        ? createPortal(
            <div
              className={styles.dataDialogOverlay}
              role="presentation"
              onClick={closeDialog}
            >
              <div
                className={styles.dataDialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="canvas-data-dialog-title"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeDialog();
                  }
                }}
              >
                <div className={styles.dataDialogHeader}>
                  <span
                    id="canvas-data-dialog-title"
                    className={styles.dataDialogTitle}
                  >
                    {editingKey !== null
                      ? t("projects.workspace.dataPanel.editing", {
                          key: editingKey,
                        })
                      : t("projects.workspace.dataPanel.add")}
                  </span>
                  <button
                    className={styles.dataDialogClose}
                    type="button"
                    aria-label={t(
                      "projects.workspace.dataPanel.actions.cancel",
                    )}
                    onClick={closeDialog}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>

                <form
                  className={styles.dataDialogForm}
                  onSubmit={commitDraft}
                >
                  <label className={styles.dataDialogField}>
                    <span>
                      {t("projects.workspace.dataPanel.fields.key")}
                    </span>
                    <input
                      className={styles.controlInput}
                      value={draftKey}
                      maxLength={64}
                      autoFocus
                      placeholder={t(
                        "projects.workspace.dataPanel.placeholders.key",
                      )}
                      aria-required="true"
                      onChange={(event) => {
                        setDraftKey(event.target.value);
                        setError("");
                      }}
                    />
                  </label>

                  <label className={styles.dataDialogField}>
                    <span>
                      {t("projects.workspace.dataPanel.fields.type")}
                    </span>
                    <select
                      className={styles.selectInput}
                      value={draftType}
                      aria-required="true"
                      onChange={(event) =>
                        handleTypeChange(event.target.value)
                      }
                    >
                      <option value="">
                        {t(
                          "projects.workspace.dataPanel.placeholders.type",
                        )}
                      </option>
                      {CANVAS_DATA_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(DATA_TYPE_LABEL_KEYS[type])}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.dataDialogField}>
                    <span>
                      {t("projects.workspace.dataPanel.fields.value")}
                    </span>
                    <DataValueInput
                      type={draftType}
                      value={draftValue}
                      onChange={(value) => {
                        setDraftValue(value);
                        setError("");
                      }}
                    />
                  </label>

                  <label className={styles.dataDialogField}>
                    <span>
                      {t("projects.workspace.dataPanel.fields.commit")}
                    </span>
                    <textarea
                      className={styles.dataCommitInput}
                      value={draftCommit}
                      maxLength={1000}
                      rows={2}
                      placeholder={t(
                        "projects.workspace.dataPanel.placeholders.commit",
                      )}
                      onChange={(event) => {
                        setDraftCommit(event.target.value);
                        setError("");
                      }}
                    />
                  </label>

                  {error ? (
                    <p className={styles.dataError}>{t(error)}</p>
                  ) : null}

                  <div className={styles.dataDialogActions}>
                    <button
                      className={styles.dataDialogCancel}
                      type="button"
                      onClick={closeDialog}
                    >
                      {t(
                        "projects.workspace.dataPanel.actions.cancel",
                      )}
                    </button>
                    <button
                      className={styles.dataDialogCommit}
                      type="submit"
                    >
                      {editingKey !== null
                        ? t("projects.workspace.dataPanel.actions.update")
                        : t(
                            "projects.workspace.dataPanel.actions.commit",
                          )}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {dataMenu
        ? createPortal(
            <div
              className={styles.contextMenu}
              style={{ left: dataMenu.x, top: dataMenu.y }}
              role="menu"
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") {
                  setDataMenu(null);
                }
              }}
            >
              <button
                className={styles.contextMenuItem}
                type="button"
                role="menuitem"
                autoFocus
                onClick={() => {
                  const entry = pageData.find(
                    (item) => item.key === dataMenu.key,
                  );
                  setDataMenu(null);
                  if (entry) openEditDialog(entry);
                }}
              >
                {t("projects.workspace.dataPanel.actions.edit")}
              </button>
              <button
                className={styles.contextMenuItem}
                type="button"
                role="menuitem"
                data-danger="true"
                onClick={() => {
                  removeEntry(dataMenu.key);
                  setDataMenu(null);
                }}
              >
                {t("projects.workspace.dataPanel.actions.delete")}
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function LinkPropertiesPanel({
  link,
  pages,
  onUpdate,
  onDelete,
}: {
  link: CanvasLink;
  pages: CanvasPage[];
  onUpdate: (linkId: string, patch: Partial<CanvasLink>) => void;
  onDelete: (linkId: string) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PropertyTab>("style");
  const fromPage = pages.find((page) => page.id === link.fromId);
  const toPage = pages.find((page) => page.id === link.toId);

  const handleWidthChange = (value: string) => {
    const width = Number.parseFloat(value);
    if (!Number.isFinite(width)) return;
    onUpdate(link.id, {
      width: Math.min(16, Math.max(1, width)),
    });
  };

  return (
    <div className={styles.propertiesPanel}>
      <div
        className={styles.propertyTabs}
        role="tablist"
        aria-label={t("projects.workspace.linkPanel.title")}
      >
        <button
          className={styles.propertyTab}
          type="button"
          role="tab"
          aria-selected={tab === "style"}
          data-active={tab === "style"}
          onClick={() => setTab("style")}
        >
          {t("projects.workspace.propertiesPanel.tabs.style")}
        </button>
        <button
          className={styles.propertyTab}
          type="button"
          role="tab"
          aria-selected={tab === "behavior"}
          data-active={tab === "behavior"}
          onClick={() => setTab("behavior")}
        >
          {t("projects.workspace.propertiesPanel.tabs.behavior")}
        </button>
      </div>

      <div className={styles.propertyBody}>
        <div className={styles.propertyToolbar}>
          <span className={styles.linkTitle}>
            {fromPage?.name ?? link.fromId} →{" "}
            {toPage?.name ?? link.toId}
          </span>
          <button
            className={styles.linkDeleteButton}
            type="button"
            onClick={() => onDelete(link.id)}
          >
            {t("projects.workspace.canvas.contextMenu.delete")}
          </button>
        </div>

        {tab === "style" ? (
          <div className={styles.controlSections}>
            <ControlSection
              title={t("projects.workspace.linkPanel.styleSection")}
            >
              <ColorControl
                label={t("projects.workspace.linkPanel.color")}
                value={link.color}
                onChange={(value) =>
                  onUpdate(link.id, { color: value })
                }
              />
              <NumberControl
                label={t("projects.workspace.linkPanel.width")}
                value={String(link.width)}
                unit=""
                min={1}
                max={16}
                step={1}
                onChange={handleWidthChange}
              />
              <div className={styles.controlRow}>
                <span className={styles.controlLabel}>
                  {t("projects.workspace.linkPanel.lineStyle")}
                </span>
                <select
                  className={styles.selectInput}
                  value={link.dashed ? "dashed" : "solid"}
                  onChange={(event) =>
                    onUpdate(link.id, {
                      dashed: event.target.value === "dashed",
                    })
                  }
                >
                  <option value="solid">
                    {t("projects.workspace.linkPanel.solid")}
                  </option>
                  <option value="dashed">
                    {t("projects.workspace.linkPanel.dashed")}
                  </option>
                </select>
              </div>
            </ControlSection>
          </div>
        ) : (
          <div className={styles.controlSections}>
            <ControlSection
              title={t("projects.workspace.linkPanel.behaviorSection")}
            >
              <div className={styles.linkDirectionRow}>
                <span className={styles.controlLabel}>
                  {t("projects.workspace.linkPanel.direction")}
                </span>
                <div className={styles.linkDirectionButtons}>
                  <button
                    className={styles.linkDirectionButton}
                    type="button"
                    data-active={link.direction === "one-way"}
                    onClick={() =>
                      onUpdate(link.id, { direction: "one-way" })
                    }
                  >
                    {t("projects.workspace.linkPanel.oneWay")}
                  </button>
                  <button
                    className={styles.linkDirectionButton}
                    type="button"
                    data-active={link.direction === "two-way"}
                    onClick={() =>
                      onUpdate(link.id, { direction: "two-way" })
                    }
                  >
                    {t("projects.workspace.linkPanel.twoWay")}
                  </button>
                </div>
              </div>
              <p className={styles.linkHint}>
                {link.direction === "one-way"
                  ? t("projects.workspace.linkPanel.oneWayHint")
                  : t("projects.workspace.linkPanel.twoWayHint")}
              </p>
            </ControlSection>
          </div>
        )}
      </div>
    </div>
  );
}

export function CanvasRightSidebar({
  pages,
  links,
  selectedId,
  selectedIds,
  selectedLink,
  onSelect,
  onUpdateLink,
  onDeleteLink,
  onRename,
  onRenameId,
  onDelete,
  onUpdateStyles,
  onUpdateWidget,
  onUpdateData,
  onReorder,
}: CanvasRightSidebarProps) {
  const { t } = useTranslation();
  const [activePanel, setActivePanel] = useState<RightPanel | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<ResizeSession | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const openFramesRef = useRef<number[]>([]);

  const selectedPage =
    pages.find((page) => page.id === selectedId) ?? null;

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const clearOpenFrames = () => {
    for (const frame of openFramesRef.current) {
      cancelAnimationFrame(frame);
    }
    openFramesRef.current = [];
  };

  useEffect(() => {
    if (!selectedLink) return;
    clearCloseTimer();
    clearOpenFrames();
    setActivePanel("properties");
    setPanelExpanded(true);
  }, [selectedLink?.id]);

  const reduceMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const expandPanel = () => {
    if (reduceMotion()) {
      setPanelExpanded(true);
      return;
    }

    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        setPanelExpanded(true);
        openFramesRef.current = [];
      });
      openFramesRef.current.push(secondFrame);
    });
    openFramesRef.current.push(firstFrame);
  };

  const handlePanelSelect = (panel: RightPanel) => {
    if (activePanel === panel) {
      if (!panelExpanded) {
        clearCloseTimer();
        setPanelExpanded(true);
        return;
      }

      clearOpenFrames();
      clearCloseTimer();
      setPanelExpanded(false);

      if (reduceMotion()) {
        setActivePanel(null);
        return;
      }

      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setActivePanel(null);
      }, PANEL_ANIMATION_MS);
      return;
    }

    clearCloseTimer();
    clearOpenFrames();

    if (activePanel === null) {
      setActivePanel(panel);
      setPanelExpanded(false);
      expandPanel();
      return;
    }

    setActivePanel(panel);
    setPanelExpanded(true);
  };

  useEffect(() => {
    return () => {
      clearCloseTimer();
      clearOpenFrames();
    };
  }, []);

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeRef.current = null;
    setResizing(false);
  };

  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelWidth,
    };
    setResizing(true);
  };

  const handleResizePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    setPanelWidth(
      clampWidth(resize.startWidth - (event.clientX - resize.startX)),
    );
  };

  const handleResizeLostCapture = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    setResizing(false);
  };

  const handleResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? RESIZE_STEP : -RESIZE_STEP;
    setPanelWidth((width) => clampWidth(width + delta));
  };

  return (
    <div className={styles.dock}>
      {activePanel ? (
        <div
          className={styles.panelViewport}
          style={{ width: panelExpanded ? panelWidth : 0 }}
          data-expanded={panelExpanded}
          data-resizing={resizing}
        >
          <aside
            id={PANEL_ID}
            className={styles.panel}
            style={{ width: panelWidth }}
            data-resizing={resizing}
            data-panel={activePanel}
            aria-label={t(PANEL_LABEL_KEYS[activePanel])}
          >
            {activePanel !== "properties" ? (
              <div className={styles.panelHeader}>
                {t(PANEL_LABEL_KEYS[activePanel])}
              </div>
            ) : null}

            {activePanel === "layers" ? (
              <LayersPanel
                pages={pages}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                onReorder={onReorder}
              />
            ) : activePanel === "data" ? (
              selectedLink ? (
                <div className={styles.dataPanel}>
                  <p className={styles.dataEmpty}>
                    {t("projects.workspace.dataPanel.linkNoData")}
                  </p>
                </div>
              ) : (
                <DataPanel
                  pages={pages}
                  links={links}
                  page={selectedPage}
                  onUpdateData={onUpdateData}
                />
              )
            ) : selectedLink ? (
              <LinkPropertiesPanel
                link={selectedLink}
                pages={pages}
                onUpdate={onUpdateLink}
                onDelete={onDeleteLink}
              />
            ) : (
              <PropertiesPanel
                pages={pages}
                page={selectedPage}
                onRename={onRename}
                onRenameId={onRenameId}
                onUpdateStyles={onUpdateStyles}
                onUpdateWidget={onUpdateWidget}
              />
            )}

            <div
              className={styles.resizeHandle}
              role="separator"
              aria-orientation="vertical"
              aria-label={t("projects.workspace.sidebarPanels.resize")}
              aria-valuemin={MIN_PANEL_WIDTH}
              aria-valuemax={MAX_PANEL_WIDTH}
              aria-valuenow={panelWidth}
              tabIndex={0}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onLostPointerCapture={handleResizeLostCapture}
              onKeyDown={handleResizeKeyDown}
            />
          </aside>
        </div>
      ) : null}

      <aside
        className={styles.rail}
        aria-label={t("projects.workspace.inspector")}
      >
        {PANEL_ITEMS.map(({ id, Icon }) => {
          const isOpen = activePanel === id;
          const label = t(PANEL_LABEL_KEYS[id]);

          return (
            <button
              key={id}
              className={styles.railItem}
              type="button"
              title={label}
              aria-label={label}
              aria-expanded={isOpen}
              aria-controls={isOpen ? PANEL_ID : undefined}
              data-active={isOpen}
              onClick={() => handlePanelSelect(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          );
        })}
      </aside>
    </div>
  );
}
