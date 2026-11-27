import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type UIEvent,
  type WheelEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { modelProviderApi, type ModelProvider } from "../../lib/api";
import {
  closeAgentConversation,
  createAgentConversation,
  getAgentState,
  selectAgentConversation,
  sendAgentTurn,
  setAgentEffort,
  setAgentModel,
  stopAgentTurn,
  subscribeAgent,
  type AgentEffort,
  type AgentImage,
  type AgentMessage,
} from "./agentSessions";
import styles from "./CanvasAgentPanel.module.css";

const EFFORTS: AgentEffort[] = ["off", "low", "medium", "high"];
const STICK_GAP = 48;

function stickToEdge(
  node: HTMLElement | null,
  pinned: { current: boolean },
  programmatic: { current: boolean },
) {
  if (!node || !pinned.current) return;
  const next = node.scrollHeight;
  if (Math.abs(node.scrollTop + node.clientHeight - next) <= 1) return;
  programmatic.current = true;
  node.scrollTop = next;
  programmatic.current = false;
}

function noteUserScroll(
  node: HTMLElement,
  pinned: { current: boolean },
  programmatic: { current: boolean },
) {
  if (programmatic.current) return;
  const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
  pinned.current = distance <= STICK_GAP;
}

function formatTokens(value: number) {
  if (value < 1000) return String(value);
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value / 1000)}k`;
}

function readImages(files: FileList | File[]) {
  return Promise.all(
    [...files].slice(0, 4).map(
      (file) =>
        new Promise<AgentImage | null>((resolve) => {
          if (!file.type.startsWith("image/")) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const result =
              typeof reader.result === "string" ? reader.result : "";
            const comma = result.indexOf(",");
            const data = comma >= 0 ? result.slice(comma + 1) : result;
            if (!data || data.length > 1_800_000) {
              resolve(null);
              return;
            }
            resolve({ mediaType: file.type, data });
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        }),
    ),
  );
}

function ThinkFold({
  text,
  live,
  collapseWhenDone,
  label,
  liveLabel,
}: {
  text: string;
  live: boolean;
  collapseWhenDone: boolean;
  label: string;
  liveLabel: string;
}) {
  const [open, setOpen] = useState(live);
  const wasLive = useRef(live);
  const preRef = useRef<HTMLPreElement>(null);
  const pinned = useRef(true);
  const programmatic = useRef(false);

  useEffect(() => {
    if (live && !wasLive.current) {
      setOpen(true);
      pinned.current = true;
    } else if (!live && wasLive.current && collapseWhenDone) {
      setOpen(false);
    }
    wasLive.current = live;
  }, [collapseWhenDone, live]);

  useLayoutEffect(() => {
    const node = preRef.current;
    if (!node || !open || !live) return;
    stickToEdge(node, pinned, programmatic);
  }, [live, open, text]);

  return (
    <details
      className={styles.fold}
      open={open}
      data-live={live ? "true" : "false"}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        if (event.currentTarget.open) pinned.current = true;
      }}
    >
      <summary>{live ? liveLabel : label}</summary>
      <pre
        ref={preRef}
        onWheel={(event) => {
          const node = event.currentTarget;
          const atTop = node.scrollTop <= 0;
          const atBottom =
            node.scrollHeight - node.scrollTop - node.clientHeight <= 1;
          if (event.deltaY < 0) pinned.current = false;
          if (
            (event.deltaY < 0 && atTop) ||
            (event.deltaY > 0 && atBottom)
          ) {
            return;
          }
          event.stopPropagation();
        }}
        onScroll={(event) =>
          noteUserScroll(event.currentTarget, pinned, programmatic)
        }
      >
        {text}
      </pre>
    </details>
  );
}

function MessageView({
  message,
  streaming,
}: {
  message: AgentMessage;
  streaming: boolean;
}) {
  const { t } = useTranslation();
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const showCaret =
    streaming && message.role === "model" && message.parts.at(-1)?.type !== "tool";

  return (
    <div className={styles.row} data-role={message.role}>
      <div className={styles.bubble}>
        {message.images && message.images.length > 0 ? (
          <div className={styles.images}>
            {message.images.map((image, index) => (
              <img
                key={`${message.id}-${index}`}
                src={`data:${image.mediaType};base64,${image.data}`}
                alt=""
              />
            ))}
          </div>
        ) : message.imageCount ? (
          <span className={styles.imageNote}>
            {t("projects.workspace.agent.imageCount", {
              count: message.imageCount,
            })}
          </span>
        ) : null}
        {message.role === "user" ? message.text : null}
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <span key={`${message.id}-text-${index}`}>
                {part.text}
                {showCaret && index === message.parts.length - 1 ? (
                  <i className={styles.caret} />
                ) : null}
              </span>
            );
          }
          if (part.type === "think") {
            const hasAnswer = message.parts.some(
              (item) =>
                (item.type === "text" && item.text.trim()) || item.type === "tool",
            );
            return (
              <ThinkFold
                key={`${message.id}-think-${index}`}
                text={part.text}
                live={streaming && index === message.parts.length - 1}
                collapseWhenDone={hasAnswer}
                label={t("projects.workspace.agent.thinking")}
                liveLabel={t("projects.workspace.agent.thinkingLive")}
              />
            );
          }
          return (
            <details
              key={part.id ?? `${message.id}-tool-${index}`}
              className={`${styles.fold} ${styles.tool}`}
              data-ok={part.ok === false ? "false" : "true"}
            >
              <summary>
                {part.pending
                  ? t("projects.workspace.agent.toolCall", { name: part.name })
                  : part.ok === false
                    ? t("projects.workspace.agent.toolFail", { name: part.name })
                    : t("projects.workspace.agent.toolOk", { name: part.name })}
              </summary>
              <pre>{part.text}</pre>
            </details>
          );
        })}
        {showCaret && !text ? <i className={styles.caret} /> : null}
      </div>
    </div>
  );
}

export function CanvasAgentPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(
    (listener) => subscribeAgent(projectId, listener),
    () => getAgentState(projectId),
    () => getAgentState(projectId),
  );
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [images, setImages] = useState<Record<string, AgentImage[]>>({});
  const transcriptRef = useRef<HTMLDivElement>(null);
  const transcriptPinned = useRef(true);
  const transcriptProgrammatic = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const conversation =
    state.conversations.find((item) => item.id === state.activeId) ??
    state.conversations[0];

  useEffect(() => {
    let cancelled = false;
    void modelProviderApi
      .list()
      .then((response) => {
        if (!cancelled) setProviders(response.providers);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!conversation || conversation.modelId) return;
    const provider = providers.find((item) => item.models.length > 0);
    const model = provider?.models[0];
    if (!provider || !model) return;
    setAgentModel(
      projectId,
      conversation.id,
      provider.id,
      model.id,
      model.supportsThinking ? "medium" : "off",
    );
  }, [conversation, projectId, providers]);

  const transcriptTail = conversation
    ? `${conversation.id}\n${conversation.messages
        .map(
          (message) =>
            `${message.text.length}:${message.parts
              .map((part) => `${part.type}${part.text.length}`)
              .join(",")}`,
        )
        .join("\n")}`
    : "";
  const messageCount = conversation?.messages.length ?? 0;
  const messageCountRef = useRef(messageCount);

  useLayoutEffect(() => {
    if (messageCount !== messageCountRef.current) {
      messageCountRef.current = messageCount;
      transcriptPinned.current = true;
    }
    const node = transcriptRef.current;
    if (!node) return;
    stickToEdge(node, transcriptPinned, transcriptProgrammatic);
  }, [messageCount, transcriptTail]);

  if (!conversation) return null;

  const selectedModel = providers
    .flatMap((provider) =>
      provider.models.map((model) => ({ provider, model })),
    )
    .find(
      (item) =>
        item.provider.id === conversation.providerId &&
        item.model.id === conversation.modelId,
    );
  const thinking = Boolean(selectedModel?.model.supportsThinking);
  const draft = drafts[conversation.id] ?? "";
  const pending = images[conversation.id] ?? [];
  const modelValue = conversation.providerId
    ? `${conversation.providerId}\n${conversation.modelId}`
    : "";

  const addImages = async (files: FileList | File[]) => {
    const next = (await readImages(files)).filter(
      (image): image is AgentImage => image !== null,
    );
    if (next.length === 0) return;
    setImages((current) => ({
      ...current,
      [conversation.id]: [...(current[conversation.id] ?? []), ...next].slice(0, 4),
    }));
  };

  const submit = () => {
    if (conversation.streaming) {
      stopAgentTurn(conversation.id);
      return;
    }
    const text = draft;
    const attached = pending;
    setDrafts((current) => ({ ...current, [conversation.id]: "" }));
    setImages((current) => ({ ...current, [conversation.id]: [] }));
    void sendAgentTurn({
      projectId,
      conversationId: conversation.id,
      text,
      images: attached,
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <section className={styles.agent} aria-label={t("projects.workspace.agent.title")}>
      <header className={styles.chats}>
        <div className={styles.chatList}>
          {state.conversations.map((item, index) => (
            <div
              key={item.id}
              className={styles.chat}
              data-active={item.id === conversation.id}
              data-streaming={item.streaming}
            >
              <button
                className={styles.chatTitle}
                type="button"
                onClick={() => selectAgentConversation(projectId, item.id)}
              >
                {item.title ||
                  t("projects.workspace.agent.chatNumber", {
                    index: index + 1,
                  })}
              </button>
              <button
                className={styles.chatClose}
                type="button"
                aria-label={t("projects.workspace.agent.closeChat")}
                onClick={() => closeAgentConversation(projectId, item.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          className={styles.newChat}
          type="button"
          onClick={() => createAgentConversation(projectId)}
        >
          {t("projects.workspace.agent.newChat")}
        </button>
      </header>

      <div className={styles.meta}>
        <select
          className={styles.select}
          aria-label={t("projects.workspace.agent.model")}
          value={modelValue}
          onChange={(event) => {
            const [providerId, modelId] = event.target.value.split("\n");
            const model = providers
              .find((item) => item.id === providerId)
              ?.models.find((item) => item.id === modelId);
            setAgentModel(
              projectId,
              conversation.id,
              providerId,
              modelId,
              model?.supportsThinking ? conversation.effort : "off",
            );
          }}
        >
          {providers.length === 0 ? (
            <option value="">{t("projects.workspace.agent.noModel")}</option>
          ) : null}
          {providers.map((provider) => (
            <optgroup key={provider.id} label={provider.name}>
              {provider.models.map((model) => (
                <option
                  key={model.id}
                  value={`${provider.id}\n${model.id}`}
                >
                  {model.displayName || model.id}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          className={`${styles.select} ${styles.effort}`}
          aria-label={t("projects.workspace.agent.effort")}
          value={thinking ? conversation.effort : "off"}
          disabled={!thinking}
          onChange={(event) =>
            setAgentEffort(
              projectId,
              conversation.id,
              event.target.value as AgentEffort,
            )
          }
        >
          {EFFORTS.map((effort) => (
            <option key={effort} value={effort}>
              {t(`projects.workspace.agent.effort_${effort}`)}
            </option>
          ))}
        </select>
        <span className={styles.tokens}>
          {t("projects.workspace.agent.tokens", {
            input: formatTokens(conversation.inputTokens),
            output: formatTokens(conversation.outputTokens),
          })}
        </span>
      </div>

      <div
        className={styles.transcript}
        ref={transcriptRef}
        onWheel={(event: WheelEvent<HTMLDivElement>) => {
          if (event.deltaY < 0) transcriptPinned.current = false;
        }}
        onScroll={(event: UIEvent<HTMLDivElement>) =>
          noteUserScroll(
            event.currentTarget,
            transcriptPinned,
            transcriptProgrammatic,
          )
        }
      >
        {conversation.messages.length === 0 ? (
          <p className={styles.empty}>
            {providers.length === 0
              ? t("projects.workspace.agent.noModelHint")
              : t("projects.workspace.agent.empty")}
          </p>
        ) : (
          conversation.messages.map((message) => (
            <MessageView
              key={message.id}
              message={message}
              streaming={
                conversation.streaming &&
                message.id ===
                  conversation.messages[conversation.messages.length - 1]?.id
              }
            />
          ))
        )}
      </div>

      {conversation.error ? (
        <p className={styles.error}>{conversation.error}</p>
      ) : null}

      <form className={styles.composer} onSubmit={onSubmit}>
        {pending.length > 0 ? (
          <div className={styles.pending}>
            {pending.map((image, index) => (
              <div key={`${image.data.slice(0, 12)}-${index}`} className={styles.pendingImage}>
                <img
                  src={`data:${image.mediaType};base64,${image.data}`}
                  alt=""
                />
                <button
                  type="button"
                  aria-label={t("projects.workspace.agent.removeImage")}
                  onClick={() =>
                    setImages((current) => ({
                      ...current,
                      [conversation.id]: pending.filter(
                        (_, imageIndex) => imageIndex !== index,
                      ),
                    }))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className={styles.entry}>
          <button
            className={styles.iconButton}
            type="button"
            aria-label={t("projects.workspace.agent.attach")}
            disabled={!selectedModel?.model.supportsMultimodal}
            onClick={() => fileRef.current?.click()}
          >
            +
          </button>
          <input
            ref={fileRef}
            className={styles.file}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={(event) => {
              if (event.target.files) void addImages(event.target.files);
              event.target.value = "";
            }}
          />
          <textarea
            value={draft}
            rows={2}
            placeholder={t("projects.workspace.agent.placeholder")}
            aria-label={t("projects.workspace.agent.placeholder")}
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [conversation.id]: event.target.value,
              }))
            }
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              const files = [...event.clipboardData.files];
              if (files.length > 0) void addImages(files);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void addImages(event.dataTransfer.files);
            }}
          />
          <button
            className={styles.send}
            type="submit"
            disabled={
              !conversation.streaming &&
              (!conversation.modelId ||
                (!draft.trim() && pending.length === 0))
            }
          >
            {conversation.streaming
              ? t("projects.workspace.agent.stop")
              : t("projects.workspace.agent.send")}
          </button>
        </div>
      </form>
    </section>
  );
}
