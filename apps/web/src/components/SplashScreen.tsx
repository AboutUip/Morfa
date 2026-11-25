import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

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
  const [measured, setMeasured] = useState(false);
  const [startOffset, setStartOffset] = useState(0);
  const [moving, setMoving] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const lockupRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const onCompleteRef = useRef(onComplete);

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
    if (!measured) return;

    let cancelled = false;
    const timers: number[] = [];
    const audio = audioRef.current;
    let motionStarted = false;
    let finishStarted = false;

    const schedule = (callback: () => void, delay: number) => {
      timers.push(window.setTimeout(callback, delay));
    };

    const finishSequence = () => {
      if (cancelled || finishStarted) return;
      finishStarted = true;
      schedule(() => setFinishing(true), HOLD_MS);
      schedule(() => onCompleteRef.current(), HOLD_MS + FADE_MS);
    };

    const startMotion = (audioPlaying: boolean) => {
      if (cancelled || motionStarted) return;
      motionStarted = true;
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

    const begin = async () => {
      if (cancelled || motionStarted) return;
      const played = await playAudio();
      if (!cancelled) startMotion(played);
    };

    schedule(() => {
      void begin();
    }, LOGO_APPEAR_MS);

    // 如果浏览器迟迟不返回 play() 结果，动画也必须自动开始。
    schedule(() => {
      if (!cancelled && !motionStarted) startMotion(false);
    }, 1_100);

    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
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
    </div>
  );
}
