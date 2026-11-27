import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";

import {
  accountComponentApi,
  projectCanvasApi,
  type ProjectSummary,
} from "../../lib/api";
import {
  copyPageToClipboard,
  duplicatePageFrom,
  hasPageClipboard,
  pastePageFromClipboard,
} from "./canvasClipboard";
import { CanvasLeftSidebar } from "./CanvasLeftSidebar";
import { CanvasRightSidebar } from "./CanvasRightSidebar";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasBehaviorEditor } from "./CanvasBehaviorEditor";
import { CanvasControlToolbar } from "./CanvasControlToolbar";
import { CanvasSimulator } from "./CanvasSimulator";
import {
  createRuntimeSnapshot,
  type RuntimeSnapshot,
} from "./canvasRuntime";
import {
  collectControlLintItems,
  createControlInstancePage,
  createControlPages,
  createControlStatePage,
  getControlDocumentPages,
  getControlNestingBlock,
  getControlStateDeleteBlock,
  isControlDirty,
  type CreateControlInput,
} from "./canvasControls";
import {
  CANVAS_TOOL_SHORTCUTS,
  type CanvasTool,
} from "./canvasTools";
import {
  clearStyleVariableFallbackCache,
  collectCanvasLint,
  computeControlSignature,
  createLinkId,
  getCanvasLayout,
  getControlDefinitions,
  getControlStates,
  getControlStateSubtree,
  getPageFrame,
  isControlDefinitionPage,
  isControlInstancePage,
  isControlInternalPage,
  isHiddenCanvasPage,
  renameLinkReferences,
  renameStyleReferences,
  type CanvasDataEntry,
  type CanvasLink,
  type CanvasLinkAnchor,
  type CanvasLintItem,
  type CanvasPage,
  type CanvasWidget,
  type CanvasBehavior,
} from "./canvasDocument";
import {
  getSubtreeIds,
  movePageInHierarchy,
  type LayerDropPosition,
} from "./canvasHierarchy";
import { useCanvasSnapSettings } from "./canvasSnap";
import { ProjectWorkspaceTopBar } from "./ProjectWorkspaceTopBar";
import { useCanvasHistory } from "./useCanvasHistory";
import { useProjectCanvas } from "./useProjectCanvas";
import styles from "./ProjectWorkspace.module.css";

const DEFAULT_LINK_COLOR = "#8b8ff0";
const MIN_LINT_PANEL_HEIGHT = 120;
const EMPTY_LINKS: CanvasLink[] = [];

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function hasPositionAnchor(styles: Record<string, string>) {
  return ["left", "right", "top", "bottom"].some((key) => {
    const value = styles[key]?.trim().toLowerCase();
    return Boolean(value && value !== "auto");
  });
}

function clearPositionAnchors(styles: Record<string, string>) {
  const next = { ...styles };
  delete next.left;
  delete next.right;
  delete next.top;
  delete next.bottom;
  return next;
}

function LintMessage({ item }: { item: CanvasLintItem }) {
  const { t } = useTranslation();

  if (item.messageKey) {
    return <>{t(item.messageKey, item.messageParams ?? {})}</>;
  }

  switch (item.code) {
    case "malformed":
      return <>{t("projects.workspace.lint.codes.malformed")}</>;
    case "missing-node":
      return (
        <>
          {t("projects.workspace.lint.codes.missingNode", {
            id: item.targetId ?? "",
          })}
        </>
      );
    case "no-access":
      return (
        <>
          {t("projects.workspace.lint.codes.noAccess", {
            name: item.targetName ?? item.targetId ?? "",
          })}
        </>
      );
    case "missing-self-key":
      return (
        <>
          {t("projects.workspace.lint.codes.missingSelfKey", {
            key: item.key ?? "",
          })}
        </>
      );
    case "missing-node-key":
      return (
        <>
          {t("projects.workspace.lint.codes.missingNodeKey", {
            name: item.targetName ?? item.targetId ?? "",
            key: item.key ?? "",
          })}
        </>
      );
    case "layout-invalid":
      return (
        <>
          {t("projects.workspace.lint.codes.layoutInvalid", {
            page: item.pageName,
            property: item.styleKey,
            value: item.expression,
          })}
        </>
      );
    case "control":
      return <>{item.expression}</>;
  }
}

function CanvasLintPanel({
  items,
  height,
  onHeightChange,
  onClose,
}: {
  items: CanvasLintItem[];
  height: number;
  onHeightChange: (height: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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

  const handleResizeMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    const maxHeight = Math.max(
      MIN_LINT_PANEL_HEIGHT,
      window.innerHeight * 0.6,
    );
    const nextHeight = Math.min(
      maxHeight,
      Math.max(
        MIN_LINT_PANEL_HEIGHT,
        resize.startHeight + resize.startY - event.clientY,
      ),
    );
    onHeightChange(nextHeight);
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
      className={styles.lintPanel}
      style={{ height }}
      aria-label={t("projects.workspace.lint.title")}
    >
      <div
        className={styles.lintResizeHandle}
        role="separator"
        aria-orientation="horizontal"
        aria-label={t("projects.workspace.lint.resize")}
        onPointerDown={startResize}
        onPointerMove={handleResizeMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={endResize}
      />

      <header className={styles.lintHeader}>
        <div className={styles.lintHeaderTitle}>
          <span className={styles.lintErrorMark}>×</span>
          <span>{t("projects.workspace.lint.title")}</span>
          <span className={styles.lintHeaderCount}>{items.length}</span>
        </div>
        <button
          className={styles.lintClose}
          type="button"
          aria-label={t("projects.workspace.lint.close")}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className={styles.lintList}>
        {items.length ? (
          items.map((item) => (
            <article className={styles.lintItem} key={item.id}>
              <div className={styles.lintItemTitle}>
                <span className={styles.lintErrorMark}>×</span>
                <span>
                  {item.pageName} · {item.styleKey}
                </span>
              </div>
              <code className={styles.lintExpression}>
                {item.expression}
              </code>
              <p className={styles.lintMessage}>
                <LintMessage item={item} />
              </p>
              {item.chain?.length ? (
                <p className={styles.lintChain}>
                  {t("projects.workspace.lint.stack")}:{" "}
                  {item.chain.join(" → ")}
                </p>
              ) : null}
            </article>
          ))
        ) : (
          <p className={styles.lintEmpty}>
            {t("projects.workspace.lint.empty")}
          </p>
        )}
      </div>
    </section>
  );
}

interface ProjectWorkspaceProps {
  project: ProjectSummary;
  onExit: () => void;
}

export function ProjectWorkspace({
  project,
  onExit,
}: ProjectWorkspaceProps) {
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [snapSettings, setSnapSettings] = useCanvasSnapSettings();
  const { pages, links, setDocument } = useProjectCanvas(project.id);
  const {
    commit,
    transient,
    beginTransaction,
    endTransaction,
    undo,
    redo,
  } = useCanvasHistory({ pages, links }, setDocument, project.id);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(
    null,
  );
  const [lintOpen, setLintOpen] = useState(false);
  const [behaviorEditorOpen, setBehaviorEditorOpen] = useState(false);
  const [lintHeight, setLintHeight] = useState(220);
  const [editingControlId, setEditingControlId] = useState<string | null>(
    null,
  );
  const [editingControlStateId, setEditingControlStateId] = useState<
    string | null
  >(null);
  const [controlLintItems, setControlLintItems] = useState<
    CanvasLintItem[] | null
  >(null);
  const [accountLibraryVersion, setAccountLibraryVersion] = useState(0);
  const [simulator, setSimulator] = useState<{
    snapshot: RuntimeSnapshot;
    sourceSignature: string;
    compiling: boolean;
    progress: number;
  } | null>(null);
  const [runChoice, setRunChoice] = useState<{
    containerId: string;
    candidates: string[];
  } | null>(null);
  const compileTimerRef = useRef<number | null>(null);
  const compileDoneTimerRef = useRef<number | null>(null);
  const selectedPageId =
    selectedPageIds[selectedPageIds.length - 1] ?? null;
  const lintItems = useMemo(
    () => collectCanvasLint(pages, links),
    [pages, links],
  );
  const editingControl = useMemo(
    () =>
      editingControlId
        ? pages.find(
            (page) =>
              isControlDefinitionPage(page) &&
              page.id === editingControlId,
          ) ?? null
        : null,
    [editingControlId, pages],
  );
  const editingControlStates = useMemo(
    () =>
      editingControlId
        ? getControlStates(pages, editingControlId)
        : [],
    [editingControlId, pages],
  );
  const canvasPages = useMemo(() => {
    if (editingControlId) {
      return editingControlStateId
        ? getControlStateSubtree(pages, editingControlStateId)
        : [];
    }
    return pages.filter(
      (page) => !isControlInternalPage(pages, page),
    );
  }, [editingControlId, editingControlStateId, pages]);
  const canvasLinks = editingControlId ? EMPTY_LINKS : links;
  const behaviorEditorPages = useMemo(
    () =>
      editingControlId
        ? getControlDocumentPages(pages, editingControlId)
        : pages,
    [editingControlId, pages],
  );
  const editingControlDirty = editingControlId
    ? isControlDirty(pages, editingControlId)
    : false;
  const blockedNestedControlIds = useMemo(() => {
    const blocked = new Set<string>();
    if (!editingControlId) return blocked;
    for (const control of getControlDefinitions(pages)) {
      if (
        getControlNestingBlock(pages, editingControlId, control.id) ===
        "cycle"
      ) {
        blocked.add(control.id);
      }
    }
    return blocked;
  }, [editingControlId, pages]);
  const displayedLintItems = controlLintItems ?? lintItems;
  const documentSignature = useMemo(
    () => JSON.stringify({ pages, links }),
    [pages, links],
  );
  const simulatorDirty = simulator
    ? simulator.sourceSignature !== documentSignature
    : false;

  useEffect(() => {
    clearStyleVariableFallbackCache();
  }, [project.id]);

  useEffect(() => {
    if (!editingControlId) {
      if (editingControlStateId) setEditingControlStateId(null);
      return;
    }

    const control = pages.find(
      (page) =>
        isControlDefinitionPage(page) && page.id === editingControlId,
    );
    if (!control) {
      setEditingControlId(null);
      setEditingControlStateId(null);
      return;
    }

    const states = getControlStates(pages, editingControlId);
    const activeState = editingControlStateId
      ? states.find((state) => state.id === editingControlStateId)
      : null;
    if (activeState) return;

    const fallback =
      states.find(
        (state) => state.id === control.control?.defaultStateId,
      ) ?? states[0];
    setEditingControlStateId(fallback?.id ?? null);
    setSelectedPageIds(fallback ? [fallback.id] : []);
  }, [editingControlId, editingControlStateId, pages]);

  useEffect(() => {
    setControlLintItems(null);
  }, [pages, links]);

  const commitPages = (update: SetStateAction<CanvasPage[]>) => {
    commit((current) => {
      const nextPages =
        typeof update === "function"
          ? (update as (items: CanvasPage[]) => CanvasPage[])(
              current.pages,
            )
          : update;
      return nextPages === current.pages
        ? current
        : { ...current, pages: nextPages };
    });
  };

  const transientPages = (update: SetStateAction<CanvasPage[]>) => {
    transient((current) => {
      const nextPages =
        typeof update === "function"
          ? (update as (items: CanvasPage[]) => CanvasPage[])(
              current.pages,
            )
          : update;
      return nextPages === current.pages
        ? current
        : { ...current, pages: nextPages };
    });
  };

  const commitLinks = (update: SetStateAction<CanvasLink[]>) => {
    commit((current) => {
      const nextLinks =
        typeof update === "function"
          ? (update as (items: CanvasLink[]) => CanvasLink[])(
              current.links,
            )
          : update;
      return nextLinks === current.links
        ? current
        : { ...current, links: nextLinks };
    });
  };

  const selectPage = (pageId: string | null) => {
    setSelectedLinkId(null);
    setSelectedPageIds(pageId ? [pageId] : []);
  };

  const selectPages = (pageIds: string[]) => {
    setSelectedLinkId(null);
    setSelectedPageIds(Array.from(new Set(pageIds)));
  };

  const selectLink = (linkId: string) => {
    setSelectedPageIds([]);
    setSelectedLinkId(linkId);
  };

  const enterControlEditor = (
    controlId: string,
    requestedStateId?: string | null,
  ) => {
    const control = pages.find(
      (page) =>
        isControlDefinitionPage(page) && page.id === controlId,
    );
    if (!control) return;
    const states = getControlStates(pages, controlId);
    const state =
      (requestedStateId
        ? states.find((item) => item.id === requestedStateId)
        : null) ??
      states.find(
        (item) => item.id === control.control?.defaultStateId,
      ) ??
      states[0] ??
      null;
    if (!state) return;

    setEditingControlId(controlId);
    setEditingControlStateId(state.id);
    setSelectedLinkId(null);
    setSelectedPageIds([state.id]);
    setBehaviorEditorOpen(false);
    setControlLintItems(null);
    setActiveTool("select");
  };

  const exitControlEditor = () => {
    setEditingControlId(null);
    setEditingControlStateId(null);
    setSelectedPageIds([]);
    setSelectedLinkId(null);
    setBehaviorEditorOpen(false);
  };

  const switchControlState = (stateId: string) => {
    if (!editingControlId) return;
    const state = getControlStates(pages, editingControlId).find(
      (item) => item.id === stateId,
    );
    if (!state) return;
    setEditingControlStateId(state.id);
    setSelectedLinkId(null);
    setSelectedPageIds([state.id]);
    setBehaviorEditorOpen(false);
  };

  const handleCreateControl = (input: CreateControlInput) => {
    const created = createControlPages(pages, input, {
      defaultStateName: t(
        "projects.workspace.controls.defaultStateName",
      ),
    });
    commitPages((current) => [...current, created.control, created.state]);
    setEditingControlId(created.control.id);
    setEditingControlStateId(created.state.id);
    setSelectedLinkId(null);
    setSelectedPageIds([created.state.id]);
    setBehaviorEditorOpen(false);
    setControlLintItems(null);
    setActiveTool("select");
  };

  const handleEditControl = (controlId: string) => {
    enterControlEditor(controlId);
  };

  const handleAddControlState = () => {
    if (!editingControl || !editingControl.control) return;
    const state = createControlStatePage(
      pages,
      editingControl,
      t("projects.workspace.controls.newStateName", {
        index: getControlStates(pages, editingControl.id).length + 1,
      }),
      240,
      120,
    );

    commitPages((current) => {
      const control = current.find(
        (page) =>
          isControlDefinitionPage(page) &&
          page.id === editingControl.id,
      );
      if (!control?.control) return current;
      const existingStates = getControlStates(current, control.id);
      const defaultStateId =
        control.control.defaultStateId &&
        existingStates.some(
          (item) => item.id === control.control?.defaultStateId,
        )
          ? control.control.defaultStateId
          : state.id;

      return [
        ...current.map((page) =>
          page.id === control.id
            ? {
                ...page,
                control: { ...control.control!, defaultStateId },
              }
            : page,
        ),
        state,
      ];
    });

    setEditingControlStateId(state.id);
    setSelectedLinkId(null);
    setSelectedPageIds([state.id]);
    setBehaviorEditorOpen(false);
  };

  const handleSetDefaultControlState = (stateId: string) => {
    if (!editingControlId) return;
    if (
      !getControlStates(pages, editingControlId).some(
        (state) => state.id === stateId,
      )
    ) {
      return;
    }
    commitPages((current) =>
      current.map((page) =>
        isControlDefinitionPage(page) &&
        page.id === editingControlId &&
        page.control
          ? {
              ...page,
              control: { ...page.control, defaultStateId: stateId },
            }
          : page,
      ),
    );
  };

  const handleCompileControl = (controlId: string) => {
    const control = pages.find(
      (page) =>
        isControlDefinitionPage(page) && page.id === controlId,
    );
    if (!control?.control) return false;

    const issues = collectControlLintItems(pages, controlId);
    const blockingIssues = issues.filter(
      (issue) => issue.severity === "error",
    );
    if (blockingIssues.length > 0) {
      setControlLintItems(issues);
      setBehaviorEditorOpen(false);
      setLintOpen(true);
      return false;
    }

    commitPages((current) => {
      const compiledAt = Date.now();
      const withStatus = current.map((page) => {
        if (
          !isControlDefinitionPage(page) ||
          page.id !== controlId ||
          !page.control
        ) {
          return page;
        }
        return {
          ...page,
          control: {
            ...page.control,
            status: "compiled" as const,
            compiledAt,
            compiledRevision:
              (page.control.compiledRevision ?? 0) + 1,
            compiledSig: "",
          },
        };
      });
      const compiledSig = computeControlSignature(
        withStatus,
        controlId,
      );
      return withStatus.map((page) =>
        isControlDefinitionPage(page) &&
        page.id === controlId &&
        page.control
          ? {
              ...page,
              control: { ...page.control, compiledSig },
            }
          : page,
      );
    });
    setControlLintItems(null);
    setLintOpen(false);
    return true;
  };

  const handleDeleteControl = (controlId: string) => {
    deletePages([controlId]);
    if (editingControlId === controlId) {
      exitControlEditor();
    }
  };

  const handlePublishControl = async (controlId: string) => {
    try {
      await accountComponentApi.publish({
        projectId: project.id,
        controlId,
      });
      setAccountLibraryVersion((version) => version + 1);
      return true;
    } catch {
      return false;
    }
  };

  const handleImportAccountComponent = async (componentId: string) => {
    const result = await accountComponentApi.import(
      componentId,
      project.id,
    );
    const response = await projectCanvasApi.get(project.id);
    setDocument({
      pages: response.pages,
      links: response.links ?? [],
    });
    setSelectedLinkId(null);
    setSelectedPageIds([result.controlId]);
    setEditingControlId(null);
    setEditingControlStateId(null);
    return result.controlId;
  };

  const handleDeleteControlState = (stateId: string) => {
    if (!editingControl) return;
    if (
      getControlStateDeleteBlock(
        editingControlStates,
        editingControl.control?.defaultStateId,
        stateId,
      )
    ) {
      return;
    }
    deletePages([stateId]);
  };

  const handleCreateControlInstance = (
    controlId: string,
    position: { x: number; y: number; parentId?: string },
  ) => {
    const ownerControlId = editingControlId ?? undefined;
    let requestedParent = position.parentId
      ? pages.find((page) => page.id === position.parentId) ?? null
      : null;

    if (ownerControlId) {
      requestedParent =
        requestedParent ??
        (editingControlStateId
          ? pages.find((page) => page.id === editingControlStateId) ?? null
          : null);
      const ownerPages = getControlDocumentPages(pages, ownerControlId);
      if (
        !requestedParent ||
        !ownerPages.some((page) => page.id === requestedParent?.id)
      ) {
        return;
      }
    }

    const parent =
      requestedParent && !isControlInstancePage(requestedParent)
        ? requestedParent
        : null;
    if (ownerControlId && !parent) return;
    let x = position.x;
    let y = position.y;
    if (parent) {
      const parentFrame = getPageFrame(parent, pages, links);
      x = position.x - parentFrame.worldX;
      y = position.y - parentFrame.worldY;
    }

    const instance = createControlInstancePage(
      pages,
      links,
      controlId,
      {
        x,
        y,
        ...(parent ? { parentId: parent.id } : {}),
      },
      ownerControlId,
    );
    if (!instance) return;
    commitPages((current) => [...current, instance]);
    setSelectedLinkId(null);
    setSelectedPageIds([instance.id]);
  };

  const handleCreatePage = (page: CanvasPage) => {
    commitPages((current) => [...current, page]);
  };

  const handleRenamePage = (pageId: string, name: string) => {
    commitPages((current) => {
      const target = current.find((page) => page.id === pageId);
      if (!target || target.name === name) return current;

      return current.map((page) =>
        page.id === pageId ? { ...page, name } : page,
      );
    });
  };

  const handleRenamePageId = (pageId: string, nextId: string) => {
    const id = nextId.trim();
    if (!id || id === pageId) return;
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(id) ||
      id.toLowerCase() === "self"
    ) {
      return;
    }
    if (pages.some((page) => page.id === id)) return;

    commit((current) => {
      if (current.pages.some((page) => page.id === id)) return current;

      return {
        pages: current.pages.map((page) => {
          const renamedId = page.id === pageId ? id : page.id;
          const parentId =
            page.parentId === pageId ? id : page.parentId;
          const next: CanvasPage = {
            ...page,
            id: renamedId,
            ...(parentId ? { parentId } : {}),
            styles: renameStyleReferences(page.styles, pageId, id),
          };

          if (next.controlId === pageId) next.controlId = id;
          if (next.controlStateId === pageId) next.controlStateId = id;
          if (next.control?.defaultStateId === pageId) {
            next.control = { ...next.control, defaultStateId: id };
          }
          return next;
        }),
        links: renameLinkReferences(current.links, pageId, id),
      };
    });

    setSelectedPageIds((current) =>
      current.map((selectedId) =>
        selectedId === pageId ? id : selectedId,
      ),
    );
    setEditingControlId((current) =>
      current === pageId ? id : current,
    );
    setEditingControlStateId((current) =>
      current === pageId ? id : current,
    );
  };

  const deletePages = (pageIds: string[]) => {
    if (!pageIds.length) return;

    const deleting = new Set<string>();
    const addSubtree = (rootId: string) => {
      const stack = [rootId];
      while (stack.length) {
        const id = stack.pop();
        if (!id || deleting.has(id)) continue;
        deleting.add(id);
        for (const page of pages) {
          if (page.parentId === id) stack.push(page.id);
        }
      }
    };

    for (const pageId of pageIds) addSubtree(pageId);

    // Deleting a control definition also removes its variants and any
    // instances that reference it, otherwise the document would be invalid.
    for (const page of pages) {
      if (
        !isControlDefinitionPage(page) ||
        !deleting.has(page.id)
      ) {
        continue;
      }
      for (const state of getControlStates(pages, page.id)) {
        addSubtree(state.id);
      }
      for (const instance of pages) {
        if (
          isControlInstancePage(instance) &&
          instance.controlId === page.id
        ) {
          addSubtree(instance.id);
        }
      }
    }

    // A control must always keep at least one state. If a delete request would
    // remove every variant, keep the states instead of writing an invalid doc.
    for (const control of pages) {
      if (
        !isControlDefinitionPage(control) ||
        deleting.has(control.id)
      ) {
        continue;
      }
      const states = getControlStates(pages, control.id);
      if (states.length === 0) continue;
      const survivors = states.filter(
        (state) => !deleting.has(state.id),
      );
      if (survivors.length > 0) continue;
      for (const state of states) {
        for (const id of getSubtreeIds(pages, state.id)) {
          deleting.delete(id);
        }
      }
    }

    commit((current) => {
      const nextPages = current.pages.filter(
        (page) => !deleting.has(page.id),
      );
      if (nextPages.length === current.pages.length) return current;

      const repairedDefaults = nextPages.map((page) => {
        if (!isControlDefinitionPage(page) || !page.control) return page;
        const states = getControlStates(nextPages, page.id);
        if (states.length === 0) return page;
        if (
          states.some(
            (state) => state.id === page.control?.defaultStateId,
          )
        ) {
          return page;
        }
        return {
          ...page,
          control: {
            ...page.control,
            defaultStateId: states[0].id,
          },
        };
      });

      const repairedInstances = repairedDefaults.map((page) => {
        if (!isControlInstancePage(page)) return page;
        const control = repairedDefaults.find(
          (item) =>
            isControlDefinitionPage(item) &&
            item.id === page.controlId,
        );
        if (!control?.control) return page;
        const states = getControlStates(repairedDefaults, control.id);
        if (states.length === 0) return page;
        if (
          page.controlStateId &&
          states.some((state) => state.id === page.controlStateId)
        ) {
          return page;
        }
        return {
          ...page,
          controlStateId: control.control.defaultStateId,
        };
      });

      return {
        pages: repairedInstances,
        links: current.links.filter(
          (link) =>
            !deleting.has(link.fromId) && !deleting.has(link.toId),
        ),
      };
    });

    setSelectedPageIds((current) =>
      current.filter((id) => !deleting.has(id)),
    );

    if (editingControlId && deleting.has(editingControlId)) {
      exitControlEditor();
      return;
    }

    if (
      editingControlId &&
      editingControlStateId &&
      deleting.has(editingControlStateId)
    ) {
      const control = pages.find(
        (page) =>
          isControlDefinitionPage(page) &&
          page.id === editingControlId,
      );
      const remainingStates = control
        ? getControlStates(pages, control.id).filter(
            (state) => !deleting.has(state.id),
          )
        : [];
      const fallback =
        remainingStates.find(
          (state) => state.id === control?.control?.defaultStateId,
        ) ?? remainingStates[0];
      if (fallback) {
        setEditingControlStateId(fallback.id);
        setSelectedLinkId(null);
        setSelectedPageIds([fallback.id]);
      } else {
        exitControlEditor();
      }
    }
  };

  const handleDeletePage = (pageId: string) => {
    deletePages([pageId]);
  };

  const handleUpdatePageStyles = (
    pageId: string,
    styles: Record<string, string>,
  ) => {
    commitPages((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, styles } : page,
      ),
    );
  };

  const handleUpdatePagePosition = (
    pageId: string,
    x: number,
    y: number,
  ) => {
    commitPages((current) => {
      const target = current.find((page) => page.id === pageId);
      if (!target) return current;

      const targetFrame = getPageFrame(target, current, links);
      const dx = x - targetFrame.worldX;
      const dy = y - targetFrame.worldY;
      if (dx === 0 && dy === 0 && !hasPositionAnchor(target.styles)) {
        return current;
      }

      const descendants = getSubtreeIds(current, pageId);
      descendants.delete(pageId);

      return current.map((page) => {
        if (page.id === pageId) {
          return {
            ...page,
            x,
            y,
            styles: clearPositionAnchors(page.styles),
          };
        }
        if (
          descendants.has(page.id) &&
          !hasPositionAnchor(page.styles)
        ) {
          return { ...page, x: page.x + dx, y: page.y + dy };
        }
        return page;
      });
    });
  };

  const handleUpdatePageWidget = (
    pageId: string,
    widget: CanvasWidget | null,
  ) => {
    commitPages((current) =>
      current.map((page) =>
        page.id === pageId
          ? { ...page, widget: widget ?? undefined }
          : page,
      ),
    );
  };

  const handleUpdatePageBehavior = (
    pageId: string,
    behavior: CanvasBehavior,
  ) => {
    commitPages((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, behavior } : page,
      ),
    );
  };

  const getRunTargets = (containerId: string) => {
    const targets = new Set<string>();
    for (const link of links) {
      if (link.fromId === containerId) targets.add(link.toId);
      if (link.direction === "two-way" && link.toId === containerId) {
        targets.add(link.fromId);
      }
    }
    targets.delete(containerId);
    return [...targets].filter((id) => {
      const page = pages.find((item) => item.id === id);
      return Boolean(page && !page.parentId);
    });
  };

  const openSimulator = (containerId: string, entryPageId: string) => {
    setSimulator({
      snapshot: createRuntimeSnapshot(
        pages,
        links,
        containerId,
        entryPageId,
      ),
      sourceSignature: documentSignature,
      compiling: false,
      progress: 0,
    });
    setRunChoice(null);
  };

  const handleRunPage = (containerId: string) => {
    const targets = getRunTargets(containerId);
    if (targets.length === 0) {
      openSimulator(containerId, containerId);
      return;
    }
    if (targets.length === 1) {
      openSimulator(containerId, targets[0]);
      return;
    }
    setRunChoice({ containerId, candidates: targets });
  };

  const clearCompileTimers = () => {
    if (compileTimerRef.current !== null) {
      window.clearTimeout(compileTimerRef.current);
      compileTimerRef.current = null;
    }
    if (compileDoneTimerRef.current !== null) {
      window.clearTimeout(compileDoneTimerRef.current);
      compileDoneTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearCompileTimers();
  }, []);

  const handleCompileSimulator = () => {
    if (!simulator || simulator.compiling) return;
    clearCompileTimers();
    setSimulator((current) =>
      current ? { ...current, compiling: true, progress: 3 } : current,
    );

    let progress = 3;
    const tick = () => {
      progress = Math.min(
        100,
        progress + 7 + Math.round(Math.random() * 9),
      );
      setSimulator((current) => {
        if (!current) return current;
        if (progress >= 100) {
          const entryPageId = pages.some(
            (page) => page.id === current.snapshot.entryPageId,
          )
            ? current.snapshot.entryPageId
            : current.snapshot.containerId;
          return {
            ...current,
            snapshot: createRuntimeSnapshot(
              pages,
              links,
              current.snapshot.containerId,
              entryPageId,
            ),
            sourceSignature: documentSignature,
            compiling: false,
            progress: 100,
          };
        }
        return { ...current, progress };
      });

      if (progress < 100) {
        compileTimerRef.current = window.setTimeout(tick, 80);
      } else {
        compileDoneTimerRef.current = window.setTimeout(() => {
          setSimulator((current) =>
            current ? { ...current, progress: 0 } : current,
          );
        }, 900);
      }
    };

    compileTimerRef.current = window.setTimeout(tick, 80);
  };

  const handleMovePage = (pageId: string, x: number, y: number) => {
    transientPages((current) => {
      const target = current.find((page) => page.id === pageId);
      if (!target) return current;

      const targetFrame = getPageFrame(target, current, links);
      const dx = x - targetFrame.worldX;
      const dy = y - targetFrame.worldY;
      const targetChanged =
        target.x !== x ||
        target.y !== y ||
        hasPositionAnchor(target.styles);
      const shiftDescendants = dx !== 0 || dy !== 0;
      if (!targetChanged && !shiftDescendants) return current;

      const descendants = getSubtreeIds(current, pageId);
      descendants.delete(pageId);

      return current.map((page) => {
        if (page.id === pageId) {
          return {
            ...page,
            x,
            y,
            styles: clearPositionAnchors(page.styles),
          };
        }
        if (
          shiftDescendants &&
          descendants.has(page.id) &&
          !hasPositionAnchor(page.styles)
        ) {
          return { ...page, x: page.x + dx, y: page.y + dy };
        }
        return page;
      });
    });
  };

  const handleUpdatePageData = (
    pageId: string,
    data: CanvasDataEntry[],
  ) => {
    commitPages((current) =>
      current.map((page) =>
        page.id === pageId ? { ...page, data } : page,
      ),
    );
  };

  const handleMovePageStart = () => {
    beginTransaction();
  };

  const handleMovePageEnd = (pageId: string, moved: boolean) => {
    if (moved) {
      transient((current) => {
        const page = current.pages.find((item) => item.id === pageId);
        if (!page) return current;

        const subtreeIds = getSubtreeIds(current.pages, pageId);
        // A state root must stay top-level; its parent is always the control
        // definition, not another canvas page.
        if (editingControlStateId === pageId) return current;

        const pageFrame = getPageFrame(
          page,
          current.pages,
          current.links,
        );
        const centerX = pageFrame.worldX + pageFrame.width / 2;
        const centerY = pageFrame.worldY + pageFrame.height / 2;
        const parentCandidates = editingControlId
          ? canvasPages
          : current.pages.filter(
              (item) =>
                !isHiddenCanvasPage(item) &&
                !isControlInstancePage(item),
            );

        let parentPage: CanvasPage | null = null;
        for (let index = parentCandidates.length - 1; index >= 0; index -= 1) {
          const candidate = parentCandidates[index];
          if (subtreeIds.has(candidate.id)) continue;
          const frame = getPageFrame(
            candidate,
            current.pages,
            current.links,
          );
          if (
            centerX >= frame.worldX &&
            centerX <= frame.worldX + frame.width &&
            centerY >= frame.worldY &&
            centerY <= frame.worldY + frame.height
          ) {
            parentPage = candidate;
            break;
          }
        }

        const nextParentId = parentPage?.id ?? null;
        if ((page.parentId ?? null) === nextParentId) return current;

        const nextPages = current.pages.map((item) => {
          if (item.id !== pageId) return item;
          if (nextParentId) {
            return { ...item, parentId: nextParentId };
          }
          const next = { ...item };
          delete next.parentId;
          return next;
        });
        const parentedIds = new Set(
          nextPages
            .filter((item) => item.parentId)
            .map((item) => item.id),
        );
        const nextLinks = current.links.filter(
          (link) =>
            !parentedIds.has(link.fromId) &&
            !parentedIds.has(link.toId),
        );

        return {
          pages: nextPages,
          links:
            nextLinks.length === current.links.length
              ? current.links
              : nextLinks,
        };
      });
    }

    endTransaction();
  };

  const handleResizePage = (
    pageId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const target = pages.find((page) => page.id === pageId);
    if (!target || target.lockedSize) return;

    const nextX = Math.round(x);
    const nextY = Math.round(y);
    const layout = getCanvasLayout(pages, links);
    const parent = target.parentId
      ? pages.find((page) => page.id === target.parentId)
      : undefined;
    const parentFrame = parent ? layout.get(parent.id) : null;
    const formatLength = (
      currentValue: string | undefined,
      nextValue: number,
      reference: number | undefined,
    ) => {
      if (
        currentValue?.trim().endsWith("%") &&
        reference !== undefined &&
        reference > 0
      ) {
        const percent = (Math.max(1, nextValue) / reference) * 100;
        return `${Number(percent.toFixed(2))}%`;
      }
      return `${Math.max(1, Math.round(nextValue))}px`;
    };
    const nextWidth = formatLength(
      target.styles.width,
      width,
      parentFrame?.width,
    );
    const nextHeight = formatLength(
      target.styles.height,
      height,
      parentFrame?.height,
    );
    if (
      target.x === nextX &&
      target.y === nextY &&
      target.styles.width === nextWidth &&
      target.styles.height === nextHeight &&
      !hasPositionAnchor(target.styles)
    ) {
      return;
    }

    transientPages((current) =>
      current.map((page) => {
        if (page.id !== pageId || page.lockedSize) return page;

        return {
          ...page,
          x: nextX,
          y: nextY,
          styles: {
            ...clearPositionAnchors(page.styles),
            width: nextWidth,
            height: nextHeight,
          },
        };
      }),
    );
  };

  const handleResizePageStart = () => {
    beginTransaction();
  };

  const handleResizePageEnd = () => {
    endTransaction();
  };

  const handleReorderPage = (
    dragId: string,
    targetId: string,
    position: LayerDropPosition,
  ) => {
    if (dragId === targetId) return;
    if (editingControlStateId) {
      if (dragId === editingControlStateId) return;
      if (targetId === editingControlStateId && position !== "inside") {
        return;
      }
    }

    commit((current) => {
      const dragPage = current.pages.find((page) => page.id === dragId);
      if (!dragPage) return current;
      const frame = getPageFrame(
        dragPage,
        current.pages,
        current.links,
      );
      const previousParentId = dragPage.parentId ?? null;

      const nextPages = movePageInHierarchy(
        current.pages,
        dragId,
        targetId,
        position,
      );
      if (!nextPages) return current;

      const movedPage = nextPages.find((page) => page.id === dragId);
      if (
        movedPage &&
        (movedPage.parentId ?? null) !== previousParentId
      ) {
        // Reparenting changes the coordinate space. Keep the node visually
        // stable by switching it to world coordinates in the new parent.
        movedPage.x = frame.worldX;
        movedPage.y = frame.worldY;
        movedPage.styles = clearPositionAnchors(movedPage.styles);
      }

      const parentedIds = new Set(
        nextPages
          .filter((page) => page.parentId)
          .map((page) => page.id),
      );
      const nextLinks = current.links.filter(
        (link) =>
          !parentedIds.has(link.fromId) &&
          !parentedIds.has(link.toId),
      );

      return {
        pages: nextPages,
        links:
          nextLinks.length === current.links.length
            ? current.links
            : nextLinks,
      };
    });
  };

  const handleCopyPage = (pageId: string) => {
    const page = pages.find((item) => item.id === pageId);
    if (page) copyPageToClipboard(page);
  };

  const handleCutPage = (pageId: string) => {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;

    copyPageToClipboard(page, "cut");
    handleDeletePage(pageId);
  };

  const normalizePastPosition = (
    page: CanvasPage,
    fallback: { x: number; y: number },
  ): CanvasPage => {
    if (!hasPositionAnchor(page.styles)) return page;
    return {
      ...page,
      x: fallback.x,
      y: fallback.y,
      styles: clearPositionAnchors(page.styles),
    };
  };

  const handlePastePage = (position?: { x: number; y: number }) => {
    const pasted = pastePageFromClipboard(
      pages,
      t("projects.workspace.canvas.copySuffix"),
      position,
    );
    if (!pasted) return;

    const pastedFrame = getPageFrame(pasted, pages, links);
    const normalized = normalizePastPosition(pasted, {
      x: position?.x ?? pastedFrame.worldX + 24,
      y: position?.y ?? pastedFrame.worldY + 24,
    });
    commitPages((current) => [...current, normalized]);
    setSelectedLinkId(null);
    setSelectedPageIds([normalized.id]);
  };

  const handleDuplicatePage = (pageId: string) => {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return;

    const duplicate = duplicatePageFrom(
      page,
      pages,
      t("projects.workspace.canvas.copySuffix"),
    );
    const sourceFrame = getPageFrame(page, pages, links);
    const normalized = normalizePastPosition(duplicate, {
      x: sourceFrame.worldX + 24,
      y: sourceFrame.worldY + 24,
    });
    commitPages((current) => [...current, normalized]);
    setSelectedLinkId(null);
    setSelectedPageIds([normalized.id]);
  };

  const handleCreateLink = (
    fromId: string,
    toId: string,
    fromAnchor: CanvasLinkAnchor,
    toAnchor: CanvasLinkAnchor,
  ) => {
    if (editingControlId) return;
    if (fromId === toId) return;
    const id = createLinkId(links);
    commitLinks((current) => [
      ...current,
      {
        id,
        fromId,
        toId,
        direction: "one-way",
        color: DEFAULT_LINK_COLOR,
        width: 2,
        dashed: false,
        fromAnchor,
        toAnchor,
        createdAt: Date.now(),
      },
    ]);
    setSelectedPageIds([]);
    setSelectedLinkId(id);
  };

  const handleUpdateLink = (
    linkId: string,
    patch: Partial<CanvasLink>,
  ) => {
    commitLinks((current) =>
      current.map((link) =>
        link.id === linkId ? { ...link, ...patch } : link,
      ),
    );
  };

  const handleDeleteLink = (linkId: string) => {
    commitLinks((current) =>
      current.filter((link) => link.id !== linkId),
    );
    setSelectedLinkId((current) => (current === linkId ? null : current));
  };

  useEffect(() => {
    setSelectedPageIds((current) => {
      const next = current.filter((id) =>
        pages.some((page) => page.id === id),
      );
      return next.length === current.length ? current : next;
    });
  }, [pages]);

  useEffect(() => {
    if (
      selectedLinkId &&
      !links.some((link) => link.id === selectedLinkId)
    ) {
      setSelectedLinkId(null);
    }
  }, [links, selectedLinkId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (document.body.dataset.canvasModal === "true") return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedLinkId) {
          event.preventDefault();
          handleDeleteLink(selectedLinkId);
          return;
        }

        if (!selectedPageIds.length) return;
        event.preventDefault();
        deletePages(selectedPageIds);
        return;
      }

      const key = event.key.toUpperCase();
      if (key === CANVAS_TOOL_SHORTCUTS.select) {
        setActiveTool("select");
      } else if (key === CANVAS_TOOL_SHORTCUTS.move) {
        setActiveTool("move");
      } else if (key === CANVAS_TOOL_SHORTCUTS.hand) {
        setActiveTool("hand");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLinkId, selectedPageIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.repeat) return;
      if (isEditableTarget(event.target)) return;
      if (document.body.dataset.canvasModal === "true") return;

      const key = event.key.toLowerCase();

      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (key === "y") {
        event.preventDefault();
        redo();
        return;
      }

      const selectedPage = selectedPageId
        ? pages.find((page) => page.id === selectedPageId)
        : null;

      if (key === "c") {
        if (!selectedPage) return;
        event.preventDefault();
        handleCopyPage(selectedPage.id);
        return;
      }

      if (key === "x") {
        if (!selectedPage) return;
        event.preventDefault();
        handleCutPage(selectedPage.id);
        return;
      }

      if (key === "v") {
        if (!hasPageClipboard()) return;
        event.preventDefault();
        handlePastePage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pages, selectedPageId, t]);

  const selectedLink =
    canvasLinks.find((link) => link.id === selectedLinkId) ?? null;

  return (
    <div className={styles.shell} data-project-workspace="true">
      <ProjectWorkspaceTopBar project={project} onExit={onExit} />

      <div className={styles.body}>
        <CanvasLeftSidebar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          projectType={project.type}
          pages={pages}
          snapSettings={snapSettings}
          onSnapSettingsChange={setSnapSettings}
          onEditControl={handleEditControl}
          onCompileControl={handleCompileControl}
          onDeleteControl={handleDeleteControl}
          onControlDragStart={() => undefined}
          blockedControlIds={blockedNestedControlIds}
          onImportAccountComponent={handleImportAccountComponent}
          accountLibraryVersion={accountLibraryVersion}
        />

        <div className={styles.canvasColumn}>
          {editingControl ? (
            <CanvasControlToolbar
              control={editingControl}
              states={editingControlStates}
              activeStateId={editingControlStateId}
              dirty={editingControlDirty}
              onSelectState={switchControlState}
              onAddState={handleAddControlState}
              onDeleteState={handleDeleteControlState}
              onSetDefaultState={handleSetDefaultControlState}
              onCompile={() => handleCompileControl(editingControl.id)}
              onPublish={() => handlePublishControl(editingControl.id)}
              onOpenBehavior={() => {
                setSelectedPageIds([editingControl.id]);
                setSelectedLinkId(null);
                setBehaviorEditorOpen(true);
                setLintOpen(false);
              }}
              onExit={exitControlEditor}
              onRenameControl={(name) =>
                handleRenamePage(editingControl.id, name)
              }
            />
          ) : null}

          <CanvasViewport
            label={project.name}
            activeTool={activeTool}
            pages={canvasPages}
            fullPages={pages}
            links={canvasLinks}
            selectedIds={selectedPageIds}
            selectedLinkId={selectedLinkId}
            snapSettings={snapSettings}
            onSelectPage={selectPage}
            onSelectPages={selectPages}
            onSelectLink={selectLink}
            onCreatePage={handleCreatePage}
            onCreateControlContainer={() =>
              handleCreateControl({
                name: t("projects.workspace.controls.controlBadge"),
                target: project.type,
                width: 240,
                height: 120,
              })
            }
            onCreateControlInstance={handleCreateControlInstance}
            onCreateLink={handleCreateLink}
            onDeleteLink={handleDeleteLink}
            onMovePage={handleMovePage}
            onMovePageStart={handleMovePageStart}
            onMovePageEnd={handleMovePageEnd}
            onResizePage={handleResizePage}
            onResizePageStart={handleResizePageStart}
            onResizePageEnd={handleResizePageEnd}
            onRenamePage={handleRenamePage}
            onDeletePage={handleDeletePage}
            onCopyPage={handleCopyPage}
            onCutPage={handleCutPage}
            onDuplicatePage={handleDuplicatePage}
            onPastePage={handlePastePage}
            onRunPage={handleRunPage}
          />
        </div>

        <CanvasRightSidebar
          pages={canvasPages}
          links={canvasLinks}
          selectedId={selectedPageId}
          selectedIds={selectedPageIds}
          selectedLink={selectedLink}
          onSelect={selectPage}
          onUpdateLink={handleUpdateLink}
          onDeleteLink={handleDeleteLink}
          onRename={handleRenamePage}
          onRenameId={handleRenamePageId}
          onDelete={handleDeletePage}
          onUpdateStyles={handleUpdatePageStyles}
          onUpdatePosition={handleUpdatePagePosition}
          onUpdateWidget={handleUpdatePageWidget}
          onUpdateData={handleUpdatePageData}
          onOpenBehaviorEditor={(pageId) => {
            setSelectedPageIds([pageId]);
            setSelectedLinkId(null);
            setBehaviorEditorOpen(true);
            setLintOpen(false);
          }}
          onReorder={handleReorderPage}
        />
      </div>

      {behaviorEditorOpen ? (
        <CanvasBehaviorEditor
          pages={behaviorEditorPages}
          pageId={selectedPageId}
          height={lintHeight}
          onHeightChange={setLintHeight}
          onClose={() => setBehaviorEditorOpen(false)}
          onUpdateBehavior={handleUpdatePageBehavior}
        />
      ) : lintOpen ? (
        <CanvasLintPanel
          items={displayedLintItems}
          height={lintHeight}
          onHeightChange={setLintHeight}
          onClose={() => {
            setLintOpen(false);
            setControlLintItems(null);
          }}
        />
      ) : null}

      {runChoice ? (
        <div
          className={styles.runChoiceOverlay}
          role="presentation"
          onClick={() => setRunChoice(null)}
        >
          <div
            className={styles.runChoiceDialog}
            role="dialog"
            aria-modal="true"
            aria-label={t("projects.workspace.simulator.chooseEntry")}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.runChoiceHeader}>
              <div>
                <h2>{t("projects.workspace.simulator.chooseEntry")}</h2>
                <p>{t("projects.workspace.simulator.chooseEntryHint")}</p>
              </div>
              <button
                className={styles.runChoiceClose}
                type="button"
                aria-label={t("projects.workspace.simulator.cancel")}
                onClick={() => setRunChoice(null)}
              >
                ×
              </button>
            </header>
            <div className={styles.runChoiceList}>
              {runChoice.candidates.map((candidateId) => {
                const candidate = pages.find(
                  (page) => page.id === candidateId,
                );
                if (!candidate) return null;
                return (
                  <button
                    className={styles.runChoiceItem}
                    type="button"
                    key={candidateId}
                    onClick={() =>
                      openSimulator(runChoice.containerId, candidateId)
                    }
                  >
                    <span className={styles.runChoicePreview}>
                      {candidate.name.slice(0, 1)}
                    </span>
                    <span className={styles.runChoiceInfo}>
                      <strong>{candidate.name}</strong>
                      <span>
                        {candidate.styles.width ?? "800px"} ×{" "}
                        {candidate.styles.height ?? "800px"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {simulator ? (
        <CanvasSimulator
          snapshot={simulator.snapshot}
          dirty={simulatorDirty}
          compiling={simulator.compiling}
          compileProgress={simulator.progress}
          onCompile={handleCompileSimulator}
          onClose={() => {
            clearCompileTimers();
            setSimulator(null);
          }}
        />
      ) : null}

      <footer className={styles.statusBar}>
        {simulator && (simulator.compiling || simulator.progress > 0) ? (
          <div className={styles.compileStatus}>
            <span className={styles.compileStatusLabel}>
              {simulator.compiling
                ? t("projects.workspace.simulator.compiling", {
                    progress: simulator.progress,
                  })
                : t("projects.workspace.simulator.compileComplete")}
            </span>
            <span className={styles.compileTrack}>
              <span
                className={styles.compileFill}
                style={{ width: `${simulator.progress}%` }}
              />
            </span>
            <span className={styles.compilePercent}>
              {simulator.progress}%
            </span>
          </div>
        ) : null}
        <button
          className={styles.lintStatusButton}
          type="button"
          data-active={lintOpen}
          data-clean={displayedLintItems.length === 0}
          onClick={() => {
            setBehaviorEditorOpen(false);
            if (lintOpen) {
              setLintOpen(false);
              setControlLintItems(null);
              return;
            }
            setLintOpen(true);
          }}
          aria-expanded={lintOpen}
          aria-label={
            displayedLintItems.length
              ? t("projects.workspace.lint.open", {
                  count: displayedLintItems.length,
                })
              : t("projects.workspace.lint.noProblems")
          }
        >
          {displayedLintItems.length ? (
            <>
              <span className={styles.lintStatusMark}>×</span>
              <span>{displayedLintItems.length}</span>
            </>
          ) : (
            <>
              <span className={styles.lintStatusCheck}>✓</span>
              <span>{t("projects.workspace.lint.noProblems")}</span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
}
