"use client";

import { useEffect } from "react";

type CoachToastProps = {
  message: string;
  onDismiss: () => void;
};

export default function CoachToast({ message, onDismiss }: CoachToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className="pointer-events-auto absolute bottom-4 left-3 right-3 z-20 rounded-2xl border border-emerald-200 bg-emerald-900 px-4 py-3 text-sm leading-snug text-emerald-50 shadow-lg">
      <p>{message}</p>
    </div>
  );
}
