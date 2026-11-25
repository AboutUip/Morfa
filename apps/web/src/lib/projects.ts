import { useSyncExternalStore } from "react";

import {
  projectApi,
  type ProjectSummary,
} from "./api";

export type ProjectsStatus = "idle" | "loading" | "ready" | "error";

export interface ProjectsSnapshot {
  projects: ProjectSummary[];
  status: ProjectsStatus;
  error: string | null;
  loadedFor: string | null;
}

const EMPTY: ProjectsSnapshot = {
  projects: [],
  status: "idle",
  error: null,
  loadedFor: null,
};

class ProjectsStore {
  private snapshot: ProjectsSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private inFlight: Promise<ProjectSummary[]> | null = null;
  private inFlightUser: string | null = null;
  private generation = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ProjectsSnapshot => this.snapshot;

  async load(
    userId: string,
    options: { force?: boolean } = {},
  ): Promise<ProjectSummary[]> {
    const sameUser = this.snapshot.loadedFor === userId;
    if (
      !options.force &&
      sameUser &&
      this.snapshot.status === "ready"
    ) {
      return this.snapshot.projects;
    }
    if (
      !options.force &&
      sameUser &&
      this.snapshot.status === "loading" &&
      this.inFlight &&
      this.inFlightUser === userId
    ) {
      return this.inFlight;
    }

    const generation = (this.generation += 1);
    this.inFlightUser = userId;
    this.set({
      ...this.snapshot,
      status: "loading",
      error: null,
      loadedFor: userId,
    });

    const promise = projectApi
      .list()
      .then(({ projects }) => {
        if (generation === this.generation) {
          this.set({
            projects,
            status: "ready",
            error: null,
            loadedFor: userId,
          });
        }
        return projects;
      })
      .catch((error: unknown) => {
        if (generation === this.generation) {
          this.set({
            ...this.snapshot,
            status: "error",
            error:
              error instanceof Error ? error.message : "无法加载项目",
            loadedFor: userId,
          });
        }
        throw error;
      })
      .finally(() => {
        if (this.inFlight === promise) {
          this.inFlight = null;
          this.inFlightUser = null;
        }
      });

    this.inFlight = promise;
    return promise;
  }

  upsert(project: ProjectSummary) {
    const exists = this.snapshot.projects.some(
      (item) => item.id === project.id,
    );
    const projects = exists
      ? this.snapshot.projects.map((item) =>
          item.id === project.id ? project : item,
        )
      : [project, ...this.snapshot.projects];

    this.set({
      ...this.snapshot,
      projects,
      status: "ready",
      error: null,
    });
  }

  clear() {
    this.generation += 1;
    this.inFlight = null;
    this.inFlightUser = null;
    this.snapshot = EMPTY;
    this.emit();
  }

  private set(snapshot: ProjectsSnapshot) {
    this.snapshot = snapshot;
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // 单个订阅者失败不影响项目状态
      }
    }
  }
}

export const projectsStore = new ProjectsStore();

export function useProjects(): ProjectsSnapshot {
  return useSyncExternalStore(
    projectsStore.subscribe,
    projectsStore.getSnapshot,
    projectsStore.getSnapshot,
  );
}
