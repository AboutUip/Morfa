import { agentApi, type AgentStreamBody } from "../../lib/api";

export type AgentEffort = AgentStreamBody["effort"];

export interface AgentImage {
  mediaType: string;
  data: string;
}

export interface AgentPart {
  type: "text" | "think" | "tool";
  text: string;
  id?: string;
  name?: string;
  ok?: boolean;
  pending?: boolean;
}

export interface AgentMessage {
  id: string;
  role: "user" | "model";
  text: string;
  images?: AgentImage[];
  imageCount?: number;
  parts: AgentPart[];
}

export interface AgentConversation {
  id: string;
  title: string;
  messages: AgentMessage[];
  providerId: string;
  modelId: string;
  effort: AgentEffort;
  inputTokens: number;
  outputTokens: number;
  streaming: boolean;
  error: string | null;
}

interface AgentState {
  activeId: string;
  conversations: AgentConversation[];
}

interface AgentHost {
  flush: () => Promise<void>;
  refresh: () => Promise<void>;
  context: () => AgentStreamBody["context"];
}

const listeners = new Map<string, Set<() => void>>();
const snapshots = new Map<string, AgentState>();
const aborts = new Map<string, AbortController>();
const hosts = new Map<string, AgentHost>();
const persistTimers = new Map<string, number>();

function storageKey(projectId: string) {
  return `morfa-agent:${projectId}`;
}

function emptyConversation(): AgentConversation {
  return {
    id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: "",
    messages: [],
    providerId: "",
    modelId: "",
    effort: "medium",
    inputTokens: 0,
    outputTokens: 0,
    streaming: false,
    error: null,
  };
}

function load(projectId: string): AgentState {
  const fallback = emptyConversation();
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return { activeId: fallback.id, conversations: [fallback] };
    const parsed = JSON.parse(raw) as AgentState;
    if (!parsed || !Array.isArray(parsed.conversations) || parsed.conversations.length === 0) {
      return { activeId: fallback.id, conversations: [fallback] };
    }
    const conversations = parsed.conversations.map((item) => ({
      ...emptyConversation(),
      ...item,
      messages: Array.isArray(item.messages)
        ? item.messages.map((message) => ({
            ...message,
            images: undefined,
            parts: Array.isArray(message.parts) ? message.parts : [],
          }))
        : [],
      streaming: false,
      error: null,
    }));
    const activeId = conversations.some((item) => item.id === parsed.activeId)
      ? parsed.activeId
      : conversations[0].id;
    return { activeId, conversations };
  } catch {
    return { activeId: fallback.id, conversations: [fallback] };
  }
}

function persist(projectId: string, state: AgentState) {
  const stored = {
    activeId: state.activeId,
    conversations: state.conversations.map((conversation) => ({
      ...conversation,
      streaming: false,
      error: null,
      messages: conversation.messages.map((message) => ({
        ...message,
        imageCount: message.images?.length ?? message.imageCount ?? 0,
        images: undefined,
      })),
    })),
  };
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(stored));
  } catch {
    // 图片和长对话可能超出本地存储，界面仍保留在内存里。
  }
}

function schedulePersist(projectId: string, state: AgentState) {
  const current = persistTimers.get(projectId);
  if (current) window.clearTimeout(current);
  persistTimers.set(
    projectId,
    window.setTimeout(() => {
      persistTimers.delete(projectId);
      persist(projectId, snapshots.get(projectId) ?? state);
    }, 300),
  );
}

function ensure(projectId: string) {
  const current = snapshots.get(projectId);
  if (current) return current;
  const loaded = load(projectId);
  snapshots.set(projectId, loaded);
  return loaded;
}

function emit(projectId: string) {
  for (const listener of listeners.get(projectId) ?? []) listener();
}

function update(
  projectId: string,
  recipe: (state: AgentState) => AgentState,
  immediate = false,
) {
  const next = recipe(ensure(projectId));
  snapshots.set(projectId, next);
  emit(projectId);
  if (immediate) persist(projectId, next);
  else schedulePersist(projectId, next);
}

function patchConversation(
  projectId: string,
  conversationId: string,
  recipe: (conversation: AgentConversation) => AgentConversation,
  immediate = false,
) {
  update(
    projectId,
    (state) => ({
      ...state,
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? recipe(conversation)
          : conversation,
      ),
    }),
    immediate,
  );
}

export function subscribeAgent(projectId: string, listener: () => void) {
  const group = listeners.get(projectId) ?? new Set();
  group.add(listener);
  listeners.set(projectId, group);
  return () => group.delete(listener);
}

export function getAgentState(projectId: string) {
  return ensure(projectId);
}

export function bindAgentHost(projectId: string, host: AgentHost | null) {
  if (host) hosts.set(projectId, host);
  else hosts.delete(projectId);
}

export function selectAgentConversation(projectId: string, conversationId: string) {
  update(projectId, (state) => ({ ...state, activeId: conversationId }), true);
}

export function createAgentConversation(projectId: string) {
  const conversation = emptyConversation();
  const current = ensure(projectId).conversations.find(
    (item) => item.id === ensure(projectId).activeId,
  );
  if (current) {
    conversation.providerId = current.providerId;
    conversation.modelId = current.modelId;
    conversation.effort = current.effort;
  }
  update(
    projectId,
    (state) => ({
      activeId: conversation.id,
      conversations: [...state.conversations, conversation],
    }),
    true,
  );
  return conversation.id;
}

export function closeAgentConversation(projectId: string, conversationId: string) {
  aborts.get(conversationId)?.abort();
  aborts.delete(conversationId);
  update(projectId, (state) => {
    const conversations = state.conversations.filter(
      (item) => item.id !== conversationId,
    );
    if (conversations.length === 0) {
      const next = emptyConversation();
      return { activeId: next.id, conversations: [next] };
    }
    return {
      activeId:
        state.activeId === conversationId
          ? conversations[conversations.length - 1].id
          : state.activeId,
      conversations,
    };
  }, true);
}

export function setAgentModel(
  projectId: string,
  conversationId: string,
  providerId: string,
  modelId: string,
  effort?: AgentEffort,
) {
  patchConversation(
    projectId,
    conversationId,
    (conversation) => ({
      ...conversation,
      providerId,
      modelId,
      ...(effort ? { effort } : {}),
    }),
    true,
  );
}

export function setAgentEffort(
  projectId: string,
  conversationId: string,
  effort: AgentEffort,
) {
  patchConversation(
    projectId,
    conversationId,
    (conversation) => ({ ...conversation, effort }),
    true,
  );
}

export function stopAgentTurn(conversationId: string) {
  aborts.get(conversationId)?.abort();
}

function appendPart(
  parts: AgentPart[],
  type: "text" | "think",
  text: string,
): AgentPart[] {
  const last = parts[parts.length - 1];
  if (last?.type === type) {
    return [
      ...parts.slice(0, -1),
      { ...last, text: last.text + text },
    ];
  }
  return [...parts, { type, text }];
}

export async function sendAgentTurn(input: {
  projectId: string;
  conversationId: string;
  text: string;
  images: AgentImage[];
}) {
  const state = ensure(input.projectId);
  const conversation = state.conversations.find(
    (item) => item.id === input.conversationId,
  );
  if (!conversation || conversation.streaming) return;
  if (!conversation.providerId || !conversation.modelId) return;
  if (!input.text.trim() && input.images.length === 0) return;

  const userMessage: AgentMessage = {
    id: `m${Date.now().toString(36)}`,
    role: "user",
    text: input.text.trim(),
    images: input.images,
    imageCount: input.images.length,
    parts: [],
  };
  const modelMessage: AgentMessage = {
    id: `m${Date.now().toString(36)}r`,
    role: "model",
    text: "",
    parts: [],
  };
  patchConversation(
    input.projectId,
    input.conversationId,
    (current) => ({
      ...current,
      title: current.title || input.text.trim().slice(0, 24),
      streaming: true,
      error: null,
      messages: [...current.messages, userMessage, modelMessage],
    }),
    true,
  );

  const abort = new AbortController();
  aborts.set(input.conversationId, abort);
  const host = hosts.get(input.projectId);

  try {
    await host?.flush().catch(() => undefined);
    const latest = ensure(input.projectId).conversations.find(
      (item) => item.id === input.conversationId,
    );
    const history = (latest?.messages ?? []).filter(
      (message) => message.id !== modelMessage.id,
    );
    const response = await agentApi.stream(
      input.projectId,
      {
        providerId: conversation.providerId,
        modelId: conversation.modelId,
        effort: conversation.effort,
        messages: history.map((message) => ({
          role: message.role === "model" ? "assistant" : "user",
          text:
            message.role === "model"
              ? message.parts
                  .map((part) =>
                    part.type === "text"
                      ? part.text
                      : part.type === "tool"
                        ? `\n[${part.name}] ${part.ok === false ? "failed" : "ok"}`
                        : "",
                  )
                  .join("") || message.text
              : message.text,
          ...(message.images?.length ? { images: message.images } : {}),
        })),
        context: host?.context() ?? {
          selectedIds: [],
          selectedNames: [],
          behaviorOpen: false,
        },
      },
      abort.signal,
    );
    if (!response.ok || !response.body) {
      let message = "Agent 没有开始";
      try {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        if (payload.error?.message) message = payload.error.message;
      } catch {
        // 保留上面的短句。
      }
      throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const apply = (recipe: (message: AgentMessage) => AgentMessage) => {
      patchConversation(input.projectId, input.conversationId, (current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.id === modelMessage.id ? recipe(message) : message,
        ),
      }));
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line) continue;
        const event = JSON.parse(line) as {
          type: string;
          text?: string;
          id?: string;
          name?: string;
          phase?: "call" | "result";
          arguments?: string;
          ok?: boolean;
          summary?: string;
          mutated?: boolean;
          inputTokens?: number;
          outputTokens?: number;
          message?: string;
        };
        if (event.type === "delta" && event.text) {
          apply((message) => ({
            ...message,
            parts: appendPart(message.parts, "text", event.text ?? ""),
          }));
        } else if (event.type === "reasoning" && event.text) {
          apply((message) => ({
            ...message,
            parts: appendPart(message.parts, "think", event.text ?? ""),
          }));
        } else if (event.type === "tool" && event.id && event.name) {
          if (event.phase === "call") {
            apply((message) => ({
              ...message,
              parts: [
                ...message.parts,
                {
                  type: "tool",
                  id: event.id,
                  name: event.name,
                  text: event.arguments ?? "",
                  pending: true,
                },
              ],
            }));
          } else {
            apply((message) => ({
              ...message,
              parts: message.parts.map((part) =>
                part.type === "tool" && part.id === event.id
                  ? {
                      ...part,
                      pending: false,
                      ok: event.ok,
                      text: event.summary ?? part.text,
                    }
                  : part,
              ),
            }));
            if (event.mutated) {
              await host?.refresh().catch(() => undefined);
            }
          }
        } else if (event.type === "usage") {
          patchConversation(input.projectId, input.conversationId, (current) => ({
            ...current,
            inputTokens: current.inputTokens + (event.inputTokens ?? 0),
            outputTokens: current.outputTokens + (event.outputTokens ?? 0),
          }));
        } else if (event.type === "error") {
          throw new Error(event.message || "Agent 中断了");
        }
      }
    }
  } catch (error) {
    if (!abort.signal.aborted) {
      const message = error instanceof Error ? error.message : "Agent 中断了";
      patchConversation(input.projectId, input.conversationId, (current) => ({
        ...current,
        error: message,
      }));
    }
  } finally {
    aborts.delete(input.conversationId);
    patchConversation(
      input.projectId,
      input.conversationId,
      (current) => ({ ...current, streaming: false }),
      true,
    );
  }
}
