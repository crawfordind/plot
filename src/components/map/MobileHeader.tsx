"use client";

import { useState } from "react";

type MobileHeaderProps = {
  userName: string | null;
  dropMode: boolean;
  onToggleDropMode: () => void;
  onOpenRecords: () => void;
  onLogout: () => void;
};

export default function MobileHeader({
  userName,
  dropMode,
  onToggleDropMode,
  onOpenRecords,
  onLogout,
}: MobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="z-20 flex shrink-0 items-center justify-between border-b border-emerald-100 bg-white/95 px-safe pt-safe backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-2 py-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold tracking-tight text-emerald-900">Plot</h1>
          {userName && (
            <p className="truncate text-[11px] text-stone-500">{userName}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 py-2">
        <button
          type="button"
          onClick={onToggleDropMode}
          aria-pressed={dropMode}
          className={`touch-target rounded-xl px-3 text-sm font-semibold ${
            dropMode
              ? "bg-emerald-600 text-white"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {dropMode ? "Cancel" : "Pin"}
        </button>

        <button
          type="button"
          onClick={onOpenRecords}
          aria-label="Open records"
          className="touch-target flex items-center justify-center rounded-xl bg-stone-100 px-3 text-sm font-medium text-stone-700"
        >
          List
        </button>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          className="touch-target flex items-center justify-center rounded-xl px-3 text-stone-500"
        >
          ···
        </button>
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-3 top-[calc(var(--safe-top)+2.75rem)] z-40 min-w-40 rounded-xl border border-stone-100 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              className="touch-target w-full px-4 text-left text-sm text-stone-700 hover:bg-stone-50"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </header>
  );
}
