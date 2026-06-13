"use client";

import { useEffect, useId, useRef, useState } from "react";

type HelpTipProps = {
  text: string;
  side?: "top" | "bottom";
};

// A small "?" affordance that reveals an explanation on tap (mobile-first) or
// hover. Use to explain terms and flows inline without cluttering the UI.
export default function HelpTip({ text, side = "top" }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const pos =
    side === "top"
      ? "bottom-full mb-1.5 -translate-x-1/2 left-1/2"
      : "top-full mt-1.5 -translate-x-1/2 left-1/2";

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="More info"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-stone-300 text-[10px] font-bold text-stone-400 hover:border-emerald-400 hover:text-emerald-600"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`scale-in absolute z-[90] ${pos} rounded-lg bg-stone-900 px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-white shadow-lg`}
          style={{ width: "max-content", maxWidth: "15rem" }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
