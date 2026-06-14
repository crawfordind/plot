import type { SVGProps } from "react";

// One cohesive line-icon set (24×24 grid, stroke = currentColor) so every icon
// inherits color and size and stays visually uniform. No external dependency.

export type IconName =
  | "map"
  | "mapPin"
  | "layers"
  | "list"
  | "leaf"
  | "sprout"
  | "flower"
  | "tree"
  | "herd"
  | "paddock"
  | "penDraw"
  | "move"
  | "resize"
  | "pencil"
  | "trash"
  | "grip"
  | "plus"
  | "check"
  | "x"
  | "chevronDown"
  | "chevronRight"
  | "info"
  | "help"
  | "gps"
  | "frame"
  | "calendar"
  | "dollar"
  | "ruler"
  | "drop"
  | "scissors"
  | "search"
  | "menu"
  | "signOut"
  | "undo"
  | "sparkle"
  | "clock"
  | "warning"
  | "cross"
  | "users"
  | "camera"
  | "chat"
  | "send";

const PATHS: Record<IconName, React.ReactNode> = {
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.2A3.2 3.2 0 0 1 16 11" />
      <path d="M17 15.2c2.3.4 4 2.3 4 4.8" />
    </>
  ),
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r="1" />
      <circle cx="3.5" cy="12" r="1" />
      <circle cx="3.5" cy="18" r="1" />
    </>
  ),
  leaf: (
    <>
      <path d="M11 20c-4 0-7-3-7-7 0-5 5-9 16-9 0 11-4 16-9 16Z" />
      <path d="M4 20c4-8 9-11 13-12" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 20v-7" />
      <path d="M12 13c0-3-2-5-6-5 0 4 2 6 6 5Z" />
      <path d="M12 11c0-3 2-5 6-5 0 4-2 6-6 5Z" />
    </>
  ),
  flower: (
    <>
      <circle cx="12" cy="9" r="2.5" />
      <path d="M12 6.5c0-2 1.5-3.5 0-3.5S12 4.5 12 6.5ZM14.5 9c2 0 3.5-1.5 3.5 0s-1.5 0-3.5 0ZM9.5 9c-2 0-3.5-1.5-3.5 0s1.5 0 3.5 0ZM12 11.5c0 2-1.5 3.5 0 3.5s0-1.5 0-3.5Z" />
      <path d="M12 14v7" />
    </>
  ),
  tree: (
    <>
      <path d="M12 13v8" />
      <path d="M12 13a5 5 0 0 0 0-10 5 5 0 0 0 0 10Z" />
      <path d="M9 21h6" />
    </>
  ),
  herd: (
    <>
      <path d="M5 11c0 4 3 7 7 7s7-3 7-7" />
      <path d="M4 8c0-2 1-3 2-3s1.5 1 1.5 2M20 8c0-2-1-3-2-3s-1.5 1-1.5 2" />
      <circle cx="10" cy="11" r="1" />
      <circle cx="14" cy="11" r="1" />
    </>
  ),
  paddock: (
    <>
      <path d="M3 6v12M9 6v12M15 6v12M21 6v12" />
      <path d="M3 9h18M3 15h18" />
    </>
  ),
  penDraw: (
    <>
      <path d="M3 21l3-1 11-11-2-2L4 18l-1 3Z" />
      <path d="m15 6 3 3" />
      <path d="M18 3l3 3-2 2-3-3 2-2Z" />
    </>
  ),
  move: (
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="m7 7-4 5 4 5M17 7l4 5-4 5M7 7l5-4 5 4M7 17l5 4 5-4" opacity="0" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </>
  ),
  resize: (
    <>
      <path d="M15 3h6v6M9 21H3v-6" />
      <path d="M21 3l-7 7M3 21l7-7" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
      <path d="m14 7 3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1.3" />
      <circle cx="15" cy="6" r="1.3" />
      <circle cx="9" cy="12" r="1.3" />
      <circle cx="15" cy="12" r="1.3" />
      <circle cx="9" cy="18" r="1.3" />
      <circle cx="15" cy="18" r="1.3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 13l4 4L19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4 1.8c0 1.5-2 2-2 3M12 16h.01" />
    </>
  ),
  gps: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  frame: (
    <>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </>
  ),
  dollar: (
    <>
      <path d="M12 3v18" />
      <path d="M16 7.5C16 6 14.5 5 12 5S8 6 8 8s2 2.5 4 3 4 1.5 4 3.5-1.5 3-4 3-4-1-4-2.5" />
    </>
  ),
  ruler: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1" transform="rotate(0 12 12)" />
      <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
    </>
  ),
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />,
  scissors: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 8l12 10M8 16 20 6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  signOut: (
    <>
      <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
    </>
  ),
  sparkle: (
    <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3L12 3ZM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
  cross: <path d="M7 7l10 10M17 7 7 17" />,
  camera: (
    <>
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1.3-2h6.4l1.3 2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  chat: (
    <>
      <path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.3-4A7.5 7.5 0 1 1 20 11.5Z" />
      <path d="M8.5 11h7M8.5 14h4.5" />
    </>
  ),
  send: <path d="M4.5 12 20 4.5 14 20l-3.2-6.3L4.5 12Z" />,
};

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

export default function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
