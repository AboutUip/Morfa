import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { BrandMark } from "./BrandMark";
import styles from "./SplashScreen.module.css";

const AUDIO_SRC = "/audio/splash-metal.wav";
const LOGO_APPEAR_MS = 220;
const MOTION_MS = 700;
const HOLD_MS = 260;
const FADE_MS = 460;

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

    const schedule = (callback: () => void, delay: number) => {
      timers.push(window.setTimeout(callback, delay));
    };

    const startMotion = () => {
      if (cancelled || motionStarted) return;
      motionStarted = true;
      setMoving(true);
      schedule(() => setFinishing(true), MOTION_MS + HOLD_MS);
      schedule(
        () => onCompleteRef.current(),
        MOTION_MS + HOLD_MS + FADE_MS,
      );
    };

    const tryPlay = () => {
      if (cancelled || !audio) {
        if (!cancelled) schedule(startMotion, 120);
        return;
      }

      audio.volume = 0.58;
      let playback: Promise<void>;
      try {
        playback = audio.play();
      } catch {
        schedule(startMotion, 140);
        return;
      }

      if (!playback) {
        startMotion();
        return;
      }

      playback.then(startMotion).catch(() => {
        if (!cancelled) schedule(startMotion, 140);
      });
    };

    const playOnGesture = () => {
      if (cancelled || !audio) return;
      audio.volume = 0.58;
      void audio.play().catch(() => {
        // 自动播放被拒绝时，首次交互仍会尝试播放
      });
    };

    window.addEventListener("pointerdown", playOnGesture, { once: true });
    window.addEventListener("keydown", playOnGesture, { once: true });
    schedule(tryPlay, LOGO_APPEAR_MS);
    schedule(startMotion, 1_200);

    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
      window.removeEventListener("pointerdown", playOnGesture);
      window.removeEventListener("keydown", playOnGesture);
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
      aria-hidden="true"
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
