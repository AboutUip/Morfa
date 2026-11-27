import { randomUUID } from "node:crypto";

import {
  deleteAccountComponentRow,
  findAccountComponentForSource,
  findAccountComponentRow,
  insertAccountComponent,
  listAccountComponentRows,
  updateAccountComponent,
  type AccountComponentRow,
} from "../db/accountComponents.js";
import { ApiError } from "../lib/errors.js";
import {
  getProjectCanvas,
  saveProjectCanvas,
  type CanvasBehaviorActionDto,
  type CanvasBehaviorConditionDto,
  type CanvasBehaviorDto,
  type CanvasPageDto,
} from "./canvasDocuments.js";
import {
  computeControlSignature,
  getControlDependencyIds,
  getControlStates,
  getControlStateSubtree,
  isControlPage,
} from "./canvasControls.js";

export interface AccountComponentSummary {
  id: string;
  name: string;
  description: string;
  target: string;
  stateCount: number;
  nodeCount: number;
  controlNames: string[];
  rootControlName: string;
  sourceProjectId: string | null;
  sourceControlId: string | null;
  createdAt: number;
  updatedAt: number;
}

function parsePages(row: AccountComponentRow): CanvasPageDto[] {
  try {
    const value = JSON.parse(row.pages_json) as unknown;
    if (!Array.isArray(value)) {
      throw new Error("pages_json is not an array");
    }
    return value as CanvasPageDto[];
  } catch {
    throw new ApiError(
      500,
      "ACCOUNT_COMPONENT_CORRUPTED",
      "组件库数据损坏",
    );
  }
}

function toSummary(row: AccountComponentRow): AccountComponentSummary {
  const pages = parsePages(row);
  const controls = pages.filter(isControlPage);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    target: row.target,
    stateCount: row.state_count,
    nodeCount: pages.length,
    controlNames: controls.map((control) => control.name),
    rootControlName:
      controls.find((control) => control.id === row.root_control_id)
        ?.name ?? row.name,
    sourceProjectId: row.source_project_id,
    sourceControlId: row.source_control_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function collectControlBundle(
  pages: CanvasPageDto[],
  rootControlId: string,
) {
  const controlIds = new Set<string>([rootControlId]);
  const pending = [rootControlId];
  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    for (const dependency of getControlDependencyIds(pages, current)) {
      if (controlIds.has(dependency)) continue;
      controlIds.add(dependency);
      pending.push(dependency);
    }
  }

  const bundle: CanvasPageDto[] = [];
  const seen = new Set<string>();
  const add = (page: CanvasPageDto) => {
    if (seen.has(page.id)) return;
    seen.add(page.id);
    bundle.push(clone(page));
  };

  for (const controlId of controlIds) {
    const control = pages.find(
      (page) => isControlPage(page) && page.id === controlId,
    );
    if (!control) continue;
    add(control);
    for (const state of getControlStates(pages, controlId)) {
      for (const page of getControlStateSubtree(pages, state.id)) {
        add(page);
      }
    }
  }

  return { pages: bundle, controlIds };
}

export function listAccountComponents(userId: string) {
  return listAccountComponentRows(userId).map(toSummary);
}

export function getAccountComponent(userId: string, componentId: string) {
  const row = findAccountComponentRow(userId, componentId);
  if (!row) {
    throw new ApiError(404, "ACCOUNT_COMPONENT_NOT_FOUND", "组件不存在");
  }
  return toSummary(row);
}

export function publishAccountComponent(input: {
  userId: string;
  projectId: string;
  controlId: string;
  name?: string;
  description?: string;
}) {
  const document = getProjectCanvas(input.userId, input.projectId);
  const control = document.pages.find(
    (page) => isControlPage(page) && page.id === input.controlId,
  );
  if (!control?.control) {
    throw new ApiError(404, "CONTROL_NOT_FOUND", "控件不存在");
  }
  if (control.control.status !== "compiled") {
    throw new ApiError(
      409,
      "CONTROL_NOT_COMPILED",
      "请先编译控件再保存到组件库",
    );
  }

  const bundle = collectControlBundle(
    document.pages,
    input.controlId,
  );
  const name =
    typeof input.name === "string" && input.name.trim()
      ? input.name.trim().slice(0, 160)
      : control.name;
  const description =
    typeof input.description === "string"
      ? input.description.trim().slice(0, 500)
      : control.control.description ?? "";
  const target = control.control.target ?? "both";
  const pagesJson = JSON.stringify(bundle.pages);
  const stateCount = getControlStates(
    document.pages,
    input.controlId,
  ).length;
  const now = Date.now();
  const existing = findAccountComponentForSource(
    input.userId,
    input.projectId,
    input.controlId,
  );

  let componentId: string;
  if (existing) {
    updateAccountComponent({
      userId: input.userId,
      id: existing.id,
      name,
      description,
      target,
      pagesJson,
      rootControlId: input.controlId,
      stateCount,
      now,
    });
    componentId = existing.id;
  } else {
    componentId = insertAccountComponent({
      userId: input.userId,
      name,
      description,
      target,
      pagesJson,
      rootControlId: input.controlId,
      stateCount,
      sourceProjectId: input.projectId,
      sourceControlId: input.controlId,
      now,
    });
  }

  return {
    component: getAccountComponent(input.userId, componentId),
    updated: Boolean(existing),
  };
}

function makeIdAllocator(existingIds: Set<string>) {
  return () => {
    let id = `n${randomUUID().replace(/-/g, "").slice(0, 7)}`;
    while (existingIds.has(id)) {
      id = `n${randomUUID().replace(/-/g, "").slice(0, 7)}`;
    }
    existingIds.add(id);
    return id;
  };
}

function uniqueControlName(
  name: string,
  usedNames: Set<string>,
) {
  const base = name.trim() || "Component";
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }
  let index = 2;
  while (usedNames.has(`${base} ${index}`)) index += 1;
  const next = `${base} ${index}`;
  usedNames.add(next);
  return next;
}

function remapCondition(
  condition: CanvasBehaviorConditionDto,
  remap: (id: string) => string,
): CanvasBehaviorConditionDto {
  return {
    ...condition,
    ...(condition.targetId
      ? { targetId: remap(condition.targetId) }
      : {}),
    ...(condition.source === "controlState" && condition.value
      ? { value: remap(condition.value) }
      : {}),
  };
}

function remapAction(
  action: CanvasBehaviorActionDto,
  remap: (id: string) => string,
): CanvasBehaviorActionDto {
  return {
    ...action,
    ...(action.targetId ? { targetId: remap(action.targetId) } : {}),
    ...(action.type === "navigate" && action.pageId
      ? { pageId: remap(action.pageId) }
      : {}),
    ...(action.type === "setControlState" && action.value
      ? { value: remap(action.value) }
      : {}),
  };
}

function remapBehavior(
  behavior: CanvasBehaviorDto | undefined,
  remap: (id: string) => string,
): CanvasBehaviorDto | undefined {
  if (!behavior) return behavior;
  return {
    ...behavior,
    triggers: behavior.triggers.map((trigger) => ({
      ...trigger,
      ...(trigger.conditions
        ? {
            conditions: trigger.conditions.map((condition) =>
              remapCondition(condition, remap),
            ),
          }
        : {}),
      actions: trigger.actions.map((action) =>
        remapAction(action, remap),
      ),
    })),
    ...(behavior.blocks
      ? {
          blocks: behavior.blocks.map((block) => ({
            ...block,
            ...(block.condition
              ? { condition: remapCondition(block.condition, remap) }
              : {}),
            ...(block.conditions
              ? {
                  conditions: block.conditions.map((condition) =>
                    remapCondition(condition, remap),
                  ),
                }
              : {}),
            ...(block.action
              ? { action: remapAction(block.action, remap) }
              : {}),
          })),
        }
      : {}),
  };
}

function compileImportedControls(
  pages: CanvasPageDto[],
  controlIds: string[],
) {
  const imported = new Set(controlIds);
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (controlId: string) => {
    if (visited.has(controlId) || !imported.has(controlId)) return;
    visited.add(controlId);
    for (const dependency of getControlDependencyIds(pages, controlId)) {
      visit(dependency);
    }
    order.push(controlId);
  };
  controlIds.forEach(visit);

  const now = Date.now();
  for (const controlId of order) {
    const control = pages.find(
      (page) => isControlPage(page) && page.id === controlId,
    );
    if (!control?.control) continue;
    control.control = {
      ...control.control,
      status: "compiled",
      compiledAt: now,
      compiledRevision: 1,
      compiledSig: "",
    };
    control.control.compiledSig = computeControlSignature(pages, controlId);
  }
}

export function importAccountComponent(input: {
  userId: string;
  projectId: string;
  componentId: string;
}) {
  const row = findAccountComponentRow(input.userId, input.componentId);
  if (!row) {
    throw new ApiError(404, "ACCOUNT_COMPONENT_NOT_FOUND", "组件不存在");
  }
  const bundle = parsePages(row);
  const document = getProjectCanvas(input.userId, input.projectId);
  const allocator = makeIdAllocator(
    new Set(document.pages.map((page) => page.id)),
  );
  const idMap = new Map<string, string>();
  for (const page of bundle) idMap.set(page.id, allocator());
  const remap = (id: string) => idMap.get(id) ?? id;
  const usedNames = new Set(
    document.pages
      .filter(isControlPage)
      .map((page) => page.name),
  );

  const imported: CanvasPageDto[] = bundle.map((page) => {
    const next: CanvasPageDto = {
      ...clone(page),
      id: remap(page.id),
      ...(page.parentId ? { parentId: remap(page.parentId) } : {}),
      ...(page.controlId ? { controlId: remap(page.controlId) } : {}),
      ...(page.controlStateId
        ? { controlStateId: remap(page.controlStateId) }
        : {}),
      ...(page.control
        ? {
            control: {
              ...page.control,
              ...(page.control.defaultStateId
                ? {
                    defaultStateId: remap(
                      page.control.defaultStateId,
                    ),
                  }
                : {}),
            },
          }
        : {}),
      ...(page.behavior
        ? { behavior: remapBehavior(page.behavior, remap) }
        : {}),
    };
    if (next.nodeKind === "control") {
      next.name = uniqueControlName(next.name, usedNames);
    }
    return next;
  });

  const importedControlIds = imported
    .filter(isControlPage)
    .map((page) => page.id);
  const nextPages = [...document.pages, ...imported];
  compileImportedControls(nextPages, importedControlIds);
  saveProjectCanvas(
    input.userId,
    input.projectId,
    nextPages,
    document.links,
  );

  const rootControlId = remap(row.root_control_id);
  return {
    component: toSummary(row),
    controlId: rootControlId,
    controlIds: importedControlIds,
    importedCount: importedControlIds.length,
    nodeCount: imported.length,
  };
}

export function deleteAccountComponent(
  userId: string,
  componentId: string,
) {
  if (!deleteAccountComponentRow(userId, componentId)) {
    throw new ApiError(404, "ACCOUNT_COMPONENT_NOT_FOUND", "组件不存在");
  }
  return { componentId, deleted: true };
}
