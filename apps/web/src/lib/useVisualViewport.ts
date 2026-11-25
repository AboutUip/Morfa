import { useEffect } from "react";

/**
 * 把 visualViewport 的尺寸同步到 CSS 变量，供移动端软键盘弹出时使用。
 * 桌面端与不支持 visualViewport 的浏览器保留 100dvh 回退值。
 */
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;

    const update = () => {
      if (viewport.height > 0) {
        root.style.setProperty("--mf-viewport-height", `${viewport.height}px`);
      }
      root.style.setProperty(
        "--mf-viewport-offset-top",
        `${viewport.offsetTop}px`,
      );
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--mf-viewport-height");
      root.style.removeProperty("--mf-viewport-offset-top");
    };
  }, []);
}
