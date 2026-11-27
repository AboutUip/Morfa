import logoBadge from "../assets/branding/logo-badge.png";
import logoMark from "../assets/branding/logo-mark.png";
import { useTheme } from "../lib/theme";
import styles from "./BrandMark.module.css";

interface BrandMarkProps {
  size?: number;
  className?: string;
  alt?: string;
}

export function BrandMark({ size = 28, className, alt = "" }: BrandMarkProps) {
  const { resolved } = useTheme();

  return (
    <span
      className={[styles.mark, className].filter(Boolean).join(" ")}
      data-variant={resolved}
      style={{ width: size, height: size }}
    >
      <img
        src={logoBadge}
        alt={resolved === "light" ? alt : ""}
        aria-hidden={resolved === "light" ? undefined : true}
        data-active={resolved === "light"}
        width={size}
        height={size}
        draggable={false}
        decoding="async"
      />
      <img
        src={logoMark}
        alt={resolved === "dark" ? alt : ""}
        aria-hidden={resolved === "dark" ? undefined : true}
        data-active={resolved === "dark"}
        width={size}
        height={size}
        draggable={false}
        decoding="async"
      />
    </span>
  );
}
