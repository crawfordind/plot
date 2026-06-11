"use client";

import { useEffect, useState } from "react";

type UndoToastProps = {
  message: string;
  onUndo: () => void | Promise<void>;
  onDismiss: () => void;
  durationMs?: number;
};

export default function UndoToast({
  message,
  onUndo,
  onDismiss,
  durationMs = 6000,
}: UndoToastProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, durationMs]);

  async function handleUndo() {
    if (busy) return;
    setBusy(true);
    try {
      await onUndo();
    } finally {
      onDismiss();
    }
  }

  return (
    <div className="pointer-events-auto absolute bottom-4 left-3 right-3 z-30 flex items-center justify-between gap-3 rounded-2xl border border-stone-700 bg-stone-900 px-4 py-3 text-sm text-stone-50 shadow-xl">
      <p className="min-w-0 truncate">{message}</p>
      <button
        type="button"
        onClick={handleUndo}
        disabled={busy}
        className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-emerald-300 active:bg-white/20 disabled:opacity-50"
      >
        {busy ? "…" : "Undo"}
      </button>
    </div>
  );
}
