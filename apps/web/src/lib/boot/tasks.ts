import { authApi, type AuthUser, type ProjectSummary } from "../api";
import { projectsStore } from "../projects";
import { preferencesRealtime, realtimeClient } from "../realtime";
import { bootScheduler } from "./scheduler";

/**
 * 启动时只注册真正需要的任务。任务会在 React render 之前开始执行，
 * 开屏动画不会等待它们；页面组件通过 bootScheduler.await/get 复用结果。
 *
 * 后续新增数据时，按依赖关系注册即可，无依赖的任务会自动并行：
 *
 * bootScheduler.register({
 *   id: "projects",
 *   dependsOn: ["session"],
 *   priority: "normal",
 *   enabled: ({ get }) => Boolean(get<BootSession>("session")?.user),
 *   run: () => projectsApi.list(),
 * });
 */

export interface BootSession {
  user: AuthUser | null;
}

export type BootPreferences = Awaited<
  ReturnType<typeof preferencesRealtime.get>
>;

// 登录状态是最关键的启动数据，最早发出。
bootScheduler.register<BootSession>({
  id: "session",
  priority: "critical",
  run: () => authApi.me(),
});

// 实时通道和偏好可以并行；偏好拉取失败时实时订阅仍会在后台继续工作。
bootScheduler.register<BootPreferences>({
  id: "preferences",
  dependsOn: ["session"],
  priority: "high",
  enabled: ({ get }) => Boolean(get<BootSession>("session")?.user),
  run: () => preferencesRealtime.get(),
});

bootScheduler.register<boolean>({
  id: "realtime",
  dependsOn: ["session"],
  priority: "normal",
  enabled: ({ get }) => Boolean(get<BootSession>("session")?.user),
  run: async () => {
    await realtimeClient.ensureConnected();
    return true;
  },
});

// 项目首页数据与偏好、实时通道并行预取，开屏结束后直接渲染。
bootScheduler.register<ProjectSummary[]>({
  id: "projects",
  dependsOn: ["session"],
  priority: "high",
  enabled: ({ get }) => Boolean(get<BootSession>("session")?.user),
  run: ({ get }) => {
    const user = get<BootSession>("session")?.user;
    if (!user) return Promise.resolve([]);
    return projectsStore.load(user.id);
  },
});

export function startBootScheduler() {
  bootScheduler.start();
}
