const PROJECT_PATH_PATTERN = /^\/projects\/([^/]+)\/?$/;

interface ProjectHistoryState {
  morfaProjectEntry?: boolean;
}

export function readProjectIdFromLocation(): string | null {
  const match = PROJECT_PATH_PATTERN.exec(window.location.pathname);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

export function pushProjectRoute(projectId: string): void {
  window.history.pushState(
    { morfaProjectEntry: true } satisfies ProjectHistoryState,
    "",
    projectPath(projectId),
  );
}

export function replaceWithProjectsRoute(): void {
  window.history.replaceState(null, "", "/");
}

export function hasProjectHistoryEntry(): boolean {
  return Boolean(
    (window.history.state as ProjectHistoryState | null)
      ?.morfaProjectEntry,
  );
}
