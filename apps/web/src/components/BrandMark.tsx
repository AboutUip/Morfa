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
  const image = resolved === "dark" ? logoMark : logoBadge;

  return (
    <span
      className={[styles.mark, className].filter(Boolean).join(" ")}
      data-variant={resolved}
      style={{ width: size, height: size }}
    >
      <img
        src={image}
        alt={alt}
        width={size}
        height={size}
        draggable={false}
        decoding="async"
      />
    </span>
  );
}
