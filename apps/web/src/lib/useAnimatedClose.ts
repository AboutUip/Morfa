import { useCallback, useEffect, useRef, useState } from "react";

import { getModalExitMs } from "./modalMotion";

/**
 * 延迟真正的关闭回调，让弹窗先播放退出动画。
 * 关闭中的弹窗由调用方通过 `closing` 应用退出样式并禁止交互。
 */
export function useAnimatedClose(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const beginClose = useCallback(() => {
    if (!mountedRef.current || closingRef.current) return;

    closingRef.current = true;
    setClosing(true);

    timerRef.current = window.setTimeout(() => {
      onCloseRef.current();
    }, getModalExitMs());
  }, []);

  return { closing, beginClose };
}
