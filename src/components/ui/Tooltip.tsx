"use client";

import { useId, useState } from "react";

type TooltipProps = {
  text: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left";
};

// Hover/focus tooltip for action controls (desktop + keyboard). On touch there's
// no hover, so the action proceeds normally — pair these with a clear aria-label.
export default function Tooltip({ text, children, side = "top" }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const pos =
    side === "top"
      ? "bottom-full left-1/2 mb-2 -translate-x-1/2"
      : side === "bottom"
        ? "top-full left-1/2 mt-2 -translate-x-1/2"
        : "right-full top-1/2 mr-2 -translate-y-1/2";

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`scale-in pointer-events-none absolute z-[90] ${pos} rounded-lg bg-stone-900 px-2.5 py-1.5 text-center text-xs font-medium leading-snug text-white shadow-lg`}
          style={{ width: "max-content", maxWidth: "14rem" }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
