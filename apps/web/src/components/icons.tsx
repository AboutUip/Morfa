import type { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function iconProps({ size = 16, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" />
    </svg>
  );
}

export function PageIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 3.5h7l5 5v12H6z" />
      <path d="M13 3.5v5h5" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.8" />
      <path d="M9 20h6M12 15.5V20" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.1 2.2-5.2 5.5-5.2s5.5 2.1 5.5 5.2" />
      <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.9M17 14.9c2.2.5 3.5 2.2 3.5 5.1" />
    </svg>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </svg>
  );
}

export function CursorIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m5 3 14 7-6 2.2L10.8 18 5 3Z" />
    </svg>
  );
}

export function HandIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M7.5 11.5V5.8a1.4 1.4 0 0 1 2.8 0v5" />
      <path d="M10.3 10.8V4.6a1.4 1.4 0 0 1 2.8 0v6.2" />
      <path d="M13.1 10.8V5.7a1.4 1.4 0 0 1 2.8 0v6.1" />
      <path d="M15.9 11.8V8.9a1.4 1.4 0 0 1 2.8 0v5.8c0 3.4-2.2 5.8-5.6 5.8h-1c-1.8 0-3.3-.8-4.4-2.2l-3-4a1.5 1.5 0 0 1 2.3-1.9l2.2 2.2" />
    </svg>
  );
}

export function MoveIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3v18M3 12h18" />
      <path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </svg>
  );
}

export function ToolsIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14.5 6.5a4 4 0 0 0-5.2 5.2L4 17l3 3 5.3-5.3a4 4 0 0 0 5.2-5.2l-2.3 2.3-2.5-.5-.5-2.5 2.3-2.3Z" />
    </svg>
  );
}

export function FrameIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M8 3v18M16 3v18M3 8h18M3 16h18" />
    </svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17" />
      <path d="M12 3c2.3 2.5 3.5 5.5 3.5 9S14.3 18.5 12 21c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3Z" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 15v4h14v-4" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 5H5v14h4" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19c.8-3.3 3.5-5.2 7-5.2s6.2 1.9 7 5.2" />
    </svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H21M17 12v3M14 12v2" />
    </svg>
  );
}

export function BackspaceIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7 6-7Z" />
      <path d="m12 9 6 6M18 9l-6 6" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 4 3 20h18L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m7 9 3 3-3 3" />
      <path d="M13.5 15H17" />
    </svg>
  );
}

export function AgentIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 16.5 4.8 19.2a1 1 0 0 0 1.3 1.3L9 19.2" />
      <path d="M8 17.5h8.2A4.8 4.8 0 0 0 18 8.2 5.5 5.5 0 0 0 8.1 6.4 4.2 4.2 0 0 0 8 17.5Z" />
      <path d="M12 9.2v2.2M12 14.2h.01" />
    </svg>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v6c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-6" />
      <path d="M5 11.5v6c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-6" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 4.5 4.5" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-8A2.5 2.5 0 0 0 3 6.5v8A2.5 2.5 0 0 0 5.5 17H8" />
    </svg>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 4h6v6" />
      <path d="m20 4-8 8" />
      <path d="M19 14.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V6.5A1.5 1.5 0 0 1 5 5h4.5" />
    </svg>
  );
}

export function SparkIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12 2c.8 5.4 4.6 9.2 10 10-5.4.8-9.2 4.6-10 10-.8-5.4-4.6-9.2-10-10 5.4-.8 9.2-4.6 10-10Z" />
    </svg>
  );
}
