"use client";

import Icon from "@/components/ui/Icon";

// The "hold the phone here" target. Two offset rings expand out of a still
// centre so the reader reads as live from arm's length, in sun, by someone who
// is looking at a tube rather than at the screen.
export default function NfcTarget({ size = 132 }: { size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
      style={{ height: size, width: size }}
      aria-hidden="true"
    >
      <span className="nfc-ping absolute inset-0 rounded-full border-[3px] border-emerald-500" />
      <span
        className="nfc-ping absolute inset-0 rounded-full border-[3px] border-emerald-500"
        style={{ animationDelay: "0.6s" }}
      />
      <Icon name="nfc" size={Math.round(size * 0.44)} strokeWidth={1.6} />
    </div>
  );
}
