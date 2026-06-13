"use client";

type Option<T extends string> = { id: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
};

// The pill-tab pattern, unified. Scrolls horizontally when it overflows.
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
}: SegmentedControlProps<T>) {
  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="no-scrollbar flex gap-1 overflow-x-auto"
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`focus-ring shrink-0 rounded-full font-semibold transition-colors ${pad} ${
              active
                ? "bg-emerald-600 text-white"
                : "bg-stone-100 text-stone-600 active:bg-stone-200"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
