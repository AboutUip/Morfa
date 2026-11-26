import {
  useEffect,
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
  LayersIcon,
  PageIcon,
  SlidersIcon,
} from "../../components/icons";
import type { CanvasPage } from "./canvasDocument";
import styles from "./CanvasRightSidebar.module.css";

const DEFAULT_PANEL_WIDTH = 240;
const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = 420;
const RESIZE_STEP = 16;
const PANEL_ANIMATION_MS = 200;
const PANEL_ID = "canvas-inspector-panel";
const LAYER_DRAG_MIME = "application/x-morfa-layer";

type RightPanel = "layers" | "properties";
type PropertyTab = "style" | "behavior";
type DropPosition = "before" | "after";

const PANEL_ITEMS = [
  { id: "layers", Icon: LayersIcon },
  { id: "properties", Icon: SlidersIcon },
] as const;

const PANEL_LABEL_KEYS: Record<RightPanel, string> = {
  layers: "projects.workspace.rightPanels.layers",
  properties: "projects.workspace.rightPanels.properties",
};

interface ResizeSession {
  pointerId: number;
  startX: number;
  startWidth: number;
}

interface CanvasRightSidebarProps {
  pages: CanvasPage[];
  selectedId: string | null;
  onSelect: (pageId: string | null) => void;
  onRename: (pageId: string, name: string) => void;
  onDelete: (pageId: string) => void;
  onUpdateStyles: (
    pageId: string,
    styles: Record<string, string>,
  ) => void;
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

function readNumeric(value: string | undefined) {
  if (!value) return "";
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
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
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const { t } = useTranslation();
  const draft = useDraftValue(readNumeric(value), (next) => {
    onChange(next === "" ? "" : `${next}${unit}`);
  });

  return (
    <div className={styles.controlRow}>
      <span className={styles.controlLabel}>{label}</span>
      <span className={styles.inputWrap}>
        <input
          className={styles.controlInput}
          type="number"
          value={draft.value}
          min={min}
          max={max}
          step={step}
          placeholder={t("projects.workspace.propertiesPanel.inherit")}
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
  const hasCustomValue = Boolean(value) && !options.includes(value ?? "");

  return (
    <div className={styles.controlRow}>
      <span className={styles.controlLabel}>{label}</span>
      <select
        className={styles.selectInput}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {t("projects.workspace.propertiesPanel.inherit")}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {hasCustomValue ? <option value={value}>{value}</option> : null}
      </select>
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
  onCommit,
}: {
  value: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
}) {
  const draft = useDraftValue(value, onCommit);

  return (
    <input
      className={styles.styleValueInput}
      value={draft.value}
      aria-label={ariaLabel}
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
  selectedId,
  onSelect,
  onRename,
  onDelete,
  onReorder,
}: {
  pages: CanvasPage[];
  selectedId: string | null;
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
        const selected = selectedId === page.id;
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

function PropertiesPanel({
  page,
  onRename,
  onUpdateStyles,
}: {
  page: CanvasPage | null;
  onRename: (pageId: string, name: string) => void;
  onUpdateStyles: (
    pageId: string,
    styles: Record<string, string>,
  ) => void;
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
    updateStyle(key, newValue);
    setNewKey("");
    setNewValue("");
  };

  const inherit = t("projects.workspace.propertiesPanel.inherit");

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

                  {Object.entries(page.styles).map(([key, value]) => (
                    <div className={styles.styleTableRow} key={key}>
                      <code className={styles.styleKey}>{key}</code>
                      <StyleTableValue
                        value={value}
                        ariaLabel={key}
                        onCommit={(next) => updateStyle(key, next)}
                      />
                      <button
                        className={styles.removeStyle}
                        type="button"
                        aria-label={t(
                          "projects.workspace.propertiesPanel.table.remove",
                        )}
                        onClick={() => removeStyle(key)}
                      >
                        ×
                      </button>
                    </div>
                  ))}

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
                      onChange={(value) => updateStyle("width", value)}
                    />
                    <NumberControl
                      label={t(
                        "projects.workspace.propertiesPanel.fields.height",
                      )}
                      value={page.styles.height}
                      onChange={(value) => updateStyle("height", value)}
                    />
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

export function CanvasRightSidebar({
  pages,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  onUpdateStyles,
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
            {activePanel === "layers" ? (
              <div className={styles.panelHeader}>
                {t("projects.workspace.rightPanels.layers")}
              </div>
            ) : null}

            {activePanel === "layers" ? (
              <LayersPanel
                pages={pages}
                selectedId={selectedId}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                onReorder={onReorder}
              />
            ) : (
              <PropertiesPanel
                page={selectedPage}
                onRename={onRename}
                onUpdateStyles={onUpdateStyles}
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
