"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import type { LocationRecord } from "@/lib/types";

type FarmBarProps = {
  farms: LocationRecord[];
  currentFarmId: string | null;
  // Zoom to and make this farm current.
  onSelectFarm: (id: string) => void;
  // Start the "define a new farm" flow (name + draw boundary).
  onNewFarm: () => void;
  // Open a farm's panel (rename, move/resize its boundary) — the dedicated way
  // to adjust a farm now that clicking inside it selects child features.
  onEditFarm: (id: string) => void;
};

// A compact switcher pinned over the map: shows the current farm and a list of
// every farm to zoom to, plus a way to define a new one.
export default function FarmBar({
  farms,
  currentFarmId,
  onSelectFarm,
  onNewFarm,
  onEditFarm,
}: FarmBarProps) {
  const [open, setOpen] = useState(false);
  const current = farms.find((f) => f.id === currentFarmId) ?? null;

  return (
    <div className="absolute left-3 top-3 z-20">
      {farms.length === 0 ? (
        <button
          type="button"
          onClick={onNewFarm}
          className="focus-ring flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/95 px-3.5 py-2 text-sm font-semibold text-emerald-800 shadow-lg backdrop-blur active:scale-95"
        >
          <Icon name="plus" size={16} />
          New farm
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="focus-ring flex max-w-[60vw] items-center gap-2 rounded-full border border-emerald-100 bg-white/95 px-3.5 py-2 text-sm font-semibold text-stone-800 shadow-lg backdrop-blur active:scale-95"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <Icon name="map" size={15} />
          </span>
          <span className="min-w-0 truncate">{current?.name ?? "Select farm"}</span>
          <Icon name="chevronDown" size={16} />
        </button>
      )}

      {open && farms.length > 0 && (
        <>
          <button
            type="button"
            aria-label="Close farm list"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-[calc(100%+0.4rem)] z-20 w-64 overflow-hidden rounded-2xl border border-stone-100 bg-white py-1 shadow-xl scale-in">
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              Jump to farm
            </p>
            <ul className="max-h-64 overflow-y-auto">
              {farms.map((farm) => {
                const active = farm.id === currentFarmId;
                return (
                  <li key={farm.id} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectFarm(farm.id);
                        setOpen(false);
                      }}
                      className={`flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3 pr-1 text-left text-sm hover:bg-stone-50 ${
                        active ? "font-semibold text-emerald-800" : "text-stone-700"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          active ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        <Icon name="map" size={15} />
                      </span>
                      <span className="min-w-0 truncate">{farm.name}</span>
                      {active && <Icon name="check" size={16} />}
                    </button>
                    <button
                      type="button"
                      aria-label={`Adjust ${farm.name}`}
                      title="Rename or move/resize this farm"
                      onClick={() => {
                        onEditFarm(farm.id);
                        setOpen(false);
                      }}
                      className="focus-ring mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                    >
                      <Icon name="pencil" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="my-1 border-t border-stone-100" />
            <button
              type="button"
              onClick={() => {
                onNewFarm();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                <Icon name="plus" size={16} />
              </span>
              New farm
            </button>
          </div>
        </>
      )}
    </div>
  );
}
