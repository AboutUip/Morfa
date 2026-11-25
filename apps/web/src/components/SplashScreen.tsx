import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";

import { BrandMark } from "./BrandMark";
import styles from "./SplashScreen.module.css";

const AUDIO_SRC = "/audio/splash-metal.mp3";
const LOGO_APPEAR_MS = 180;
const MOTION_MS = 900;
const HOLD_MS = 160;
const FADE_MS = 420;

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const { t } = useTranslation();
  const [measured, setMeasured] = useState(false);
  const [startOffset, setStartOffset] = useState(0);
  const [moving, setMoving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [waitingForGesture, setWaitingForGesture] = useState(false);

  const lockupRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hintRef = useRef<HTMLButtonElement>(null);
  const onCompleteRef = useRef(onComplete);
  const gestureHandlerRef = useRef<() => void>(() => {});

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useLayoutEffect(() => {
    const lockup = lockupRef.current;
    const logo = logoRef.current;
    if (!lockup || !logo) return;

    const offset = Math.max(
      0,
      (lockup.getBoundingClientRect().width - logo.offsetWidth) / 2,
    );
    setStartOffset(offset);
    setMeasured(true);
  }, []);

  useEffect(() => {
    if (waitingForGesture) hintRef.current?.focus();
  }, [waitingForGesture]);

  useEffect(() => {
    if (!measured) return;

    let cancelled = false;
    const timers: number[] = [];
    const audio = audioRef.current;
    let motionStarted = false;
    let finishStarted = false;
    let gestureHandling = false;
    let gestureAttached = false;
    let initialPlaySettled = false;

    const schedule = (callback: () => void, delay: number) => {
      timers.push(window.setTimeout(callback, delay));
    };

    const finishSequence = () => {
      if (cancelled || finishStarted) return;
      finishStarted = true;
      schedule(() => setFinishing(true), HOLD_MS);
      schedule(
        () => onCompleteRef.current(),
        HOLD_MS + FADE_MS,
      );
    };

    const startMotion = (audioPlaying: boolean) => {
      if (cancelled || motionStarted) return;
      motionStarted = true;
      setWaitingForGesture(false);
      setMoving(true);

      if (audioPlaying) {
        const duration =
          Number.isFinite(audio?.duration) && (audio?.duration ?? 0) > 0
            ? (audio?.duration as number)
            : 1.9;
        const remaining = Math.max(
          0,
          duration - (audio?.currentTime ?? 0),
        );
        // 正常情况由 ended 事件收尾；此定时器只防止音频事件丢失。
        schedule(finishSequence, remaining * 1000 + 800);
        return;
      }

      schedule(finishSequence, MOTION_MS + HOLD_MS);
    };

    const onAudioEnded = () => {
      if (!cancelled && motionStarted) finishSequence();
    };

    audio?.addEventListener("ended", onAudioEnded);

    const playAudio = async (): Promise<boolean> => {
      if (!audio) return false;
      audio.volume = 0.58;
      try {
        await audio.play();
        return true;
      } catch {
        return false;
      }
    };

    const handleGesture = async () => {
      if (cancelled || motionStarted || gestureHandling) return;
      gestureHandling = true;
      detachGesture();

      const played = await playAudio();
      if (cancelled) return;
      startMotion(played);
    };

    const attachGesture = () => {
      if (gestureAttached) return;
      gestureAttached = true;
      window.addEventListener("pointerdown", handleGesture, { once: true });
      window.addEventListener("keydown", handleGesture, { once: true });
    };

    const detachGesture = () => {
      if (!gestureAttached) return;
      gestureAttached = false;
      window.removeEventListener("pointerdown", handleGesture);
      window.removeEventListener("keydown", handleGesture);
    };

    const tryInitialPlay = async () => {
      if (cancelled || motionStarted) return;
      const played = await playAudio();
      initialPlaySettled = true;
      if (cancelled) return;

      if (played) {
        startMotion(true);
        return;
      }

      setWaitingForGesture(true);
      attachGesture();
    };

    gestureHandlerRef.current = () => {
      void handleGesture();
    };

    schedule(() => {
      void tryInitialPlay();
    }, LOGO_APPEAR_MS);

    schedule(() => {
      if (cancelled || motionStarted || initialPlaySettled) return;
      setWaitingForGesture(true);
      attachGesture();
    }, 1_500);

    return () => {
      cancelled = true;
      gestureHandlerRef.current = () => {};
      for (const timer of timers) window.clearTimeout(timer);
      detachGesture();
      audio?.removeEventListener("ended", onAudioEnded);
      audio?.pause();
    };
  }, [measured]);

  return (
    <div
      className={styles.splash}
      data-splash-screen="true"
      data-measured={measured}
      data-moving={moving}
      data-finishing={finishing}
      data-waiting={waitingForGesture}
    >
      <audio
        ref={audioRef}
        className={styles.audio}
        src={AUDIO_SRC}
        preload="auto"
        playsInline
        aria-hidden="true"
      />

      <div className={styles.stage}>
        <div
          ref={lockupRef}
          className={styles.lockup}
          style={
            {
              "--splash-start-x": `${startOffset}px`,
            } as CSSProperties
          }
        >
          <div ref={logoRef} className={styles.logo}>
            <BrandMark size={64} />
          </div>
          <span className={styles.pipe} />
          <span className={styles.wordmark}>Morfa</span>
        </div>
      </div>

      {waitingForGesture && !moving ? (
        <button
          ref={hintRef}
          className={styles.hint}
          type="button"
          onClick={() => gestureHandlerRef.current()}
        >
          {t("splash.tapToStart")}
        </button>
      ) : null}
    </div>
  );
}
