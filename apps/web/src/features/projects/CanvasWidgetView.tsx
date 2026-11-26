import type { CanvasWidget, CanvasWidgetKind } from "./canvasDocument";
import styles from "./CanvasWidgetView.module.css";

export const WIDGET_TEXT_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "button",
  "select",
  "text",
  "input",
  "search",
  "textarea",
  "checkbox",
  "radio",
  "toggle",
  "progress",
  "image",
  "video",
  "avatar",
  "badge",
  "card",
  "tabs",
  "alert",
  "chart",
]);

export const WIDGET_VALUE_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "progress",
  "slider",
]);

export const WIDGET_SOURCE_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "image",
  "video",
  "avatar",
  "card",
]);

export const WIDGET_DESCRIPTION_KINDS: ReadonlySet<CanvasWidgetKind> =
  new Set(["card", "chart"]);

export const WIDGET_CHECKED_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "checkbox",
  "radio",
  "toggle",
]);

export const WIDGET_OPTIONS_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "select",
]);

export const WIDGET_ACTIVE_INDEX_KINDS: ReadonlySet<CanvasWidgetKind> =
  new Set(["select", "tabs"]);

export const WIDGET_DATA_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "chart",
]);

export const WIDGET_FIT_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "image",
  "video",
]);

export const WIDGET_SHOW_VALUE_KINDS: ReadonlySet<CanvasWidgetKind> =
  new Set(["progress"]);

export const WIDGET_DISABLED_KINDS: ReadonlySet<CanvasWidgetKind> = new Set([
  "button",
]);

export const WIDGET_VARIANT_OPTIONS: Partial<
  Record<CanvasWidgetKind, readonly string[]>
> = {
  button: ["primary", "secondary", "ghost", "icon"],
  text: ["heading", "paragraph", "label"],
  badge: ["accent", "success", "warning", "danger"],
  alert: ["info", "success", "warning", "error"],
  chart: ["bar", "line"],
};

function clampValue(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

function textOr(value: string | undefined, fallback: string) {
  const text = value?.trim();
  return text ? text : fallback;
}

function ChevronIcon() {
  return (
    <svg className={styles.fieldIcon} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className={styles.fieldIcon} viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M10.2 10.2L14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 8.2l3 3 6-6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className={styles.alertClose} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" fill="currentColor" />
      <path
        d="M8 7v4M8 4.8v.4"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3.5"
        y="4.5"
        width="17"
        height="15"
        rx="2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="8.6" cy="9.4" r="1.6" fill="currentColor" />
      <path
        d="M4.8 17l4.4-4.7 3.1 3.2 2.5-2.4 4.4 3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l10-6.5z" fill="currentColor" />
    </svg>
  );
}

function renderWidget(widget: CanvasWidget) {
  switch (widget.kind) {
    case "button": {
      const variant = widget.variant ?? "primary";
      return (
        <span
          className={styles.button}
          data-variant={variant}
          data-disabled={widget.disabled ? "true" : undefined}
        >
          {variant === "icon" ? (
            <PlusIcon />
          ) : (
            textOr(widget.text, "Button")
          )}
        </span>
      );
    }

    case "select": {
      const options = (widget.options ?? []).filter(Boolean);
      const selectedIndex = Math.min(
        Math.max(0, widget.activeIndex ?? 0),
        Math.max(0, options.length - 1),
      );
      const label = options.length
        ? options[selectedIndex]
        : textOr(widget.text, "Select an option");
      return (
        <span className={styles.field}>
          <span className={styles.fieldText}>{label}</span>
          <ChevronIcon />
        </span>
      );
    }

    case "input":
      return (
        <span className={styles.field}>
          <span className={styles.fieldText}>
            {textOr(widget.text, "Enter text")}
          </span>
          <span className={styles.caret} />
        </span>
      );

    case "search":
      return (
        <span className={styles.field} data-rounded="true">
          <SearchIcon />
          <span className={styles.fieldText}>
            {textOr(widget.text, "Search")}
          </span>
        </span>
      );

    case "textarea":
      return (
        <span className={`${styles.field} ${styles.textarea}`}>
          <span className={styles.fieldText}>
            {textOr(widget.text, "Write something")}
          </span>
          <span className={styles.resizeGrip} />
        </span>
      );

    case "text": {
      const variant = widget.variant ?? "paragraph";
      const fallback =
        variant === "heading"
          ? "Heading"
          : variant === "label"
            ? "Label"
            : "Paragraph text goes here.";
      return (
        <span className={styles.text} data-variant={variant}>
          {textOr(widget.text, fallback)}
        </span>
      );
    }

    case "progress": {
      const value = clampValue(widget.value);
      return (
        <span className={styles.progress}>
          <span className={styles.progressHeader}>
            <span>{textOr(widget.text, "Progress")}</span>
            {widget.showValue === false ? null : <span>{value}%</span>}
          </span>
          <span className={styles.progressTrack}>
            <span
              className={styles.progressFill}
              style={{ width: `${value}%` }}
            />
          </span>
        </span>
      );
    }

    case "slider": {
      const value = clampValue(widget.value);
      return (
        <span className={styles.slider}>
          <span className={styles.sliderTrack}>
            <span
              className={styles.sliderFill}
              style={{ width: `${value}%` }}
            />
          </span>
          <span
            className={styles.sliderThumb}
            style={{ left: `${value}%` }}
          />
        </span>
      );
    }

    case "checkbox": {
      const checked = widget.checked ?? true;
      return (
        <span className={styles.choice}>
          <span className={styles.checkBox} data-checked={checked}>
            {checked ? <CheckIcon /> : null}
          </span>
          <span className={styles.choiceLabel}>
            {textOr(widget.text, "Checkbox")}
          </span>
        </span>
      );
    }

    case "radio": {
      const checked = widget.checked ?? true;
      return (
        <span className={styles.choice}>
          <span className={styles.radio} data-checked={checked}>
            {checked ? <span className={styles.radioDot} /> : null}
          </span>
          <span className={styles.choiceLabel}>
            {textOr(widget.text, "Radio option")}
          </span>
        </span>
      );
    }

    case "toggle": {
      const checked = widget.checked ?? true;
      return (
        <span className={styles.choice}>
          <span className={styles.toggle} data-checked={checked}>
            <span className={styles.toggleThumb} />
          </span>
          <span className={styles.choiceLabel}>
            {textOr(widget.text, "Toggle")}
          </span>
        </span>
      );
    }

    case "image":
      return (
        <span className={styles.media}>
          {widget.src ? (
            <img
              src={widget.src}
              alt=""
              draggable={false}
              style={{
                objectFit: widget.fit === "contain" ? "contain" : "cover",
              }}
            />
          ) : (
            <span className={styles.imagePlaceholder}>
              <ImageIcon />
              <span>{textOr(widget.text, "Image")}</span>
            </span>
          )}
        </span>
      );

    case "video":
      return (
        <span className={`${styles.media} ${styles.video}`}>
          {widget.src ? (
            <video
              src={widget.src}
              muted
              playsInline
              preload="metadata"
              style={{
                objectFit: widget.fit === "contain" ? "contain" : "cover",
              }}
            />
          ) : (
            <span className={styles.videoBackdrop} />
          )}
          <span className={styles.videoOverlay}>
            <span className={styles.playButton}>
              <PlayIcon />
            </span>
            <span className={styles.videoLabel}>
              {textOr(widget.text, "Video")}
            </span>
          </span>
        </span>
      );

    case "avatar": {
      const label = textOr(widget.text, "M");
      return (
        <span className={styles.avatar}>
          {widget.src ? (
            <img src={widget.src} alt="" draggable={false} />
          ) : (
            <span>{label.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
      );
    }

    case "badge":
      return (
        <span className={styles.badge} data-variant={widget.variant ?? "accent"}>
          {textOr(widget.text, "New")}
        </span>
      );

    case "card": {
      const description = widget.description?.trim();
      return (
        <span className={styles.card}>
          <span className={styles.cardMedia}>
            {widget.src ? (
              <img src={widget.src} alt="" draggable={false} />
            ) : (
              <ImageIcon />
            )}
          </span>
          <span className={styles.cardBody}>
            <span className={styles.cardTitle}>
              {textOr(widget.text, "Card title")}
            </span>
            {description ? (
              <span className={styles.cardDescription}>{description}</span>
            ) : (
              <>
                <span className={styles.cardLine} />
                <span className={styles.cardLine} data-short="true" />
              </>
            )}
          </span>
        </span>
      );
    }

    case "tabs": {
      const labels = textOr(widget.text, "Overview|Details|Settings")
        .split("|")
        .map((label) => label.trim())
        .filter(Boolean);
      const activeIndex = Math.min(
        Math.max(0, widget.activeIndex ?? 0),
        Math.max(0, labels.length - 1),
      );
      return (
        <span className={styles.tabs}>
          {labels.map((label, index) => (
            <span
              className={styles.tab}
              data-active={index === activeIndex}
              key={`${label}:${index}`}
            >
              {label}
            </span>
          ))}
        </span>
      );
    }

    case "alert":
      return (
        <span
          className={styles.alert}
          data-variant={widget.variant ?? "info"}
        >
          <span className={styles.alertIcon}>
            <InfoIcon />
          </span>
          <span className={styles.alertText}>
            {textOr(widget.text, "Heads up, this is an alert.")}
          </span>
          <CloseIcon />
        </span>
      );

    case "divider":
      return <span className={styles.divider} />;

    case "chart": {
      const values = (
        widget.data?.length ? widget.data : [36, 62, 46, 78, 58, 88]
      )
        .slice(0, 12)
        .map((point) => Math.min(100, Math.max(0, point)));
      const max = Math.max(...values, 1);
      const variant = widget.variant ?? "bar";
      const title = widget.text?.trim();
      const description = widget.description?.trim();
      const linePoints = values
        .map((value, index) => {
          const x =
            values.length <= 1
              ? 50
              : (index / (values.length - 1)) * 100;
          const y = 100 - (value / max) * 100;
          return `${x},${y}`;
        })
        .join(" ");

      return (
        <span className={styles.chart}>
          {title || description ? (
            <span className={styles.chartHeader}>
              {title ? (
                <span className={styles.chartTitle}>{title}</span>
              ) : null}
              {description ? (
                <span className={styles.chartSubtitle}>{description}</span>
              ) : null}
            </span>
          ) : null}
          <span className={styles.chartBody}>
            <span className={styles.chartGrid} />
            {variant === "line" ? (
              <svg
                className={styles.chartLine}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline points={linePoints} />
              </svg>
            ) : (
              <span className={styles.chartBars}>
                {values.map((value, index) => (
                  <span
                    className={styles.chartBar}
                    style={{ height: `${(value / max) * 100}%` }}
                    key={index}
                  />
                ))}
              </span>
            )}
          </span>
        </span>
      );
    }

    default:
      return null;
  }
}

export function CanvasWidgetView({ widget }: { widget: CanvasWidget }) {
  return (
    <span className={styles.root} data-kind={widget.kind} aria-hidden="true">
      {renderWidget(widget)}
    </span>
  );
}
