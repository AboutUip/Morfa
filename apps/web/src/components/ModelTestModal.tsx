import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { CloseIcon, SparkIcon } from "./icons";
import {
  ApiError,
  modelProviderApi,
  type ModelProviderModel,
} from "../lib/api";
import { apiErrorMessage } from "../lib/apiErrors";
import { lockBackground } from "../lib/backgroundLock";
import { useAnimatedClose } from "../lib/useAnimatedClose";
import styles from "./ModelTestModal.module.css";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type TestStatus = "idle" | "streaming" | "success" | "error";

interface ModelTestModalProps {
  providerName: string;
  providerId: string;
  model: ModelProviderModel;
  onClose: () => void;
}

interface StreamEvent {
  type: "start" | "delta" | "reasoning" | "done" | "error";
  text?: string;
  code?: string;
  message?: string;
  durationMs?: number;
  textLength?: number;
  modelId?: string;
  thinking?: boolean;
  streaming?: boolean;
}

export function ModelTestModal({
  providerName,
  providerId,
  model,
  onClose,
}: ModelTestModalProps) {
  const { t } = useTranslation();
  const { closing, beginClose } = useAnimatedClose(onClose);

  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState<TestStatus>("idle");
  const [output, setOutput] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [streamingMode, setStreamingMode] = useState<boolean | null>(
    null,
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const firstControlRef = useRef<HTMLButtonElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const reasoningRef = useRef<HTMLPreElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const runTestRef = useRef<(useThinking: boolean) => Promise<void>>(
    async () => {},
  );

  useLayoutEffect(() => {
    const releaseBackground = lockBackground();
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => {
      const target =
        firstControlRef.current &&
        !firstControlRef.current.disabled
          ? firstControlRef.current
          : panelRef.current;
      target?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      mountedRef.current = false;
      abortRef.current?.abort();
      releaseBackground();
      if (trigger?.isConnected) {
        requestAnimationFrame(() => {
          if (trigger.isConnected) trigger.focus();
        });
      }
    };
  }, []);

  const runTest = useCallback(
    async (useThinking: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("streaming");
      setOutput("");
      setReasoning("");
      setError(null);
      setDuration(null);
      setStreamingMode(model.supportsStreaming);

      try {
        const response = await modelProviderApi.testStream(
          providerId,
          model.id,
          useThinking,
          controller.signal,
        );

        if (!response.ok) {
          let code = "MODEL_REQUEST_FAILED";
          let message = `Request failed (${response.status})`;

          try {
            const body = (await response.json()) as {
              error?: { code?: string; message?: string };
            };
            if (body.error?.code) code = body.error.code;
            if (body.error?.message) message = body.error.message;
          } catch {
            // 非 JSON 错误响应
          }

          throw new ApiError(response.status, code, message);
        }

        if (!response.body) {
          throw new ApiError(
            400,
            "MODEL_STREAM_INVALID",
            "模型没有返回可读取的流",
          );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let completed = false;
        let nextOutput = "";
        let nextReasoning = "";

        const handleEvent = (event: StreamEvent) => {
          if (event.type === "start") {
            setStreamingMode(Boolean(event.streaming));
            return;
          }

          if (event.type === "delta" && event.text) {
            nextOutput += event.text;
            setOutput(nextOutput);
            return;
          }

          if (event.type === "reasoning" && event.text) {
            nextReasoning += event.text;
            setReasoning(nextReasoning);
            return;
          }

          if (event.type === "done") {
            completed = true;
            setStatus("success");
            setDuration(event.durationMs ?? null);
            return;
          }

          if (event.type === "error") {
            completed = true;
            setStatus("error");
            setError(
              apiErrorMessage(
                t,
                new ApiError(0, event.code ?? "MODEL_REQUEST_FAILED", event.message ?? ""),
                "profile.models.errors.testFailed",
              ),
            );
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);

            if (line) {
              try {
                handleEvent(JSON.parse(line) as StreamEvent);
              } catch {
                throw new ApiError(
                  400,
                  "MODEL_STREAM_INVALID",
                  "模型测试流格式不正确",
                );
              }
            }

            newline = buffer.indexOf("\n");
          }
        }

        if (!completed && !controller.signal.aborted) {
          throw new ApiError(
            400,
            "MODEL_STREAM_INVALID",
            "模型测试连接已中断",
          );
        }
      } catch (testError) {
        if (!mountedRef.current || controller.signal.aborted) return;

        setStatus("error");
        setError(
          apiErrorMessage(
            t,
            testError,
            "profile.models.errors.testFailed",
          ),
        );
      }
    },
    [model.id, model.supportsStreaming, providerId, t],
  );

  useEffect(() => {
    runTestRef.current = runTest;
  }, [runTest]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runTestRef.current(false);
    }, 80);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    if (reasoningRef.current) {
      reasoningRef.current.scrollTop =
        reasoningRef.current.scrollHeight;
    }
  }, [reasoning]);

  const requestClose = () => {
    abortRef.current?.abort();
    beginClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getClientRects().length > 0);

      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);

      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last?.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleRetry = () => {
    void runTest(thinking);
  };

  const stopTest = () => {
    abortRef.current?.abort();
    setStatus("error");
    setError(t("profile.models.test.stopped"));
  };

  const started = status !== "idle";
  const durationLabel =
    duration !== null ? `${(duration / 1000).toFixed(2)}s` : null;

  return createPortal(
    <div
      className={styles.overlay}
      data-model-test-modal="true"
      data-closing={closing}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-test-title"
        aria-describedby="model-test-description"
        tabIndex={-1}
        inert={closing}
        aria-busy={status === "streaming"}
      >
        <div className={styles.heading}>
          <span className={styles.icon} aria-hidden="true">
            <SparkIcon size={17} />
          </span>
          <h2 id="model-test-title">
            {t("profile.models.test.title")}
          </h2>
          <p id="model-test-description">
            {providerName} · {model.displayName ?? model.id}
          </p>
          <div className={styles.capabilityTags}>
            <span>
              {model.supportsStreaming
                ? t("profile.models.test.streaming")
                : t("profile.models.test.nonStreaming")}
            </span>
            {model.supportsThinking ? (
              <span>{t("profile.models.capabilities.thinking")}</span>
            ) : null}
            {model.supportsMultimodal ? (
              <span>{t("profile.models.capabilities.multimodal")}</span>
            ) : null}
          </div>
        </div>

        <div className={styles.testOptions}>
          <button
            ref={firstControlRef}
            className={styles.thinkingRow}
            type="button"
            role="switch"
            aria-checked={thinking}
            onClick={() => setThinking((current) => !current)}
            disabled={!model.supportsThinking || status === "streaming"}
          >
            <span className={styles.thinkingCopy}>
              <span className={styles.thinkingLabel}>
                {t("profile.models.test.thinking")}
              </span>
              <span className={styles.thinkingHint}>
                {model.supportsThinking
                  ? t("profile.models.test.thinkingHint")
                  : t("profile.models.test.thinkingUnsupported")}
              </span>
            </span>
            <span
              className={styles.switchTrack}
              data-checked={thinking && model.supportsThinking}
              aria-hidden="true"
            >
              <span className={styles.switchThumb} />
            </span>
          </button>
          <p className={styles.tokenNote}>
            {t("profile.models.test.tokenNote")}
          </p>
        </div>

        <div className={styles.statusRow} role="status">
          <span
            className={styles.statusDot}
            data-status={status}
            aria-hidden="true"
          />
          <span className={styles.statusText}>
            {status === "idle"
              ? t("profile.models.test.preparing")
              : status === "streaming"
                ? t("profile.models.test.running")
                : status === "success"
                  ? durationLabel
                    ? t("profile.models.test.successWithTime", {
                        duration: durationLabel,
                      })
                    : t("profile.models.test.success")
                  : error ?? t("profile.models.errors.testFailed")}
          </span>
          {streamingMode !== null ? (
            <span className={styles.modeTag}>
              {streamingMode
                ? t("profile.models.test.streaming")
                : t("profile.models.test.nonStreaming")}
            </span>
          ) : null}
        </div>

        {reasoning ? (
          <div className={styles.outputBlock}>
            <div className={styles.outputLabel}>
              {t("profile.models.test.reasoning")}
            </div>
            <pre ref={reasoningRef} className={styles.reasoningOutput}>
              {reasoning}
            </pre>
          </div>
        ) : null}

        <div className={styles.outputBlock}>
          <div className={styles.outputLabel}>
            {t("profile.models.test.response")}
          </div>
          <pre ref={outputRef} className={styles.output}>
            {output ||
              (status === "streaming"
                ? t("profile.models.test.waiting")
                : t("profile.models.test.emptyOutput"))}
          </pre>
        </div>

        <div className={styles.actions}>
          {status === "streaming" ? (
            <button
              className={styles.secondary}
              type="button"
              onClick={stopTest}
            >
              {t("profile.models.test.stop")}
            </button>
          ) : started ? (
            <button
              className={styles.secondary}
              type="button"
              onClick={handleRetry}
            >
              {t("profile.models.test.retry")}
            </button>
          ) : null}
          <button
            className={styles.primary}
            type="button"
            onClick={requestClose}
          >
            {t("profile.models.test.close")}
          </button>
        </div>

        <button
          className={styles.closeButton}
          type="button"
          onClick={requestClose}
          aria-label={t("profile.models.test.close")}
          title={t("profile.models.test.close")}
        >
          <CloseIcon size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
