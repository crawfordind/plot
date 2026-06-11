"use client";

import { useMapInteraction } from "@/components/map/MapInteractionContext";
import type { LocationRecord, LocationType } from "@/lib/types";

type LocationFieldProps = {
  locations: LocationRecord[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  pickTitle?: string;
  types?: LocationType[];
  placeholder?: string;
  allowNone?: boolean;
};

export default function LocationField({
  locations,
  value,
  onChange,
  label = "Location",
  pickTitle = "Tap a location on the map",
  types,
  placeholder = "Choose on map",
  allowNone = false,
}: LocationFieldProps) {
  const { requestPick } = useMapInteraction();
  const selected = locations.find((l) => l.id === value) ?? null;

  async function pick() {
    const id = await requestPick({ title: pickTitle, types });
    if (id) onChange(id);
  }

  return (
    <div>
      <span className="block text-xs font-medium text-stone-600">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={pick}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-stone-200 px-3 py-2.5 text-left text-sm active:bg-emerald-50"
        >
          <span className={`truncate ${selected ? "text-stone-800" : "text-stone-400"}`}>
            {selected ? selected.name : placeholder}
          </span>
          <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
            📍 Pick
          </span>
        </button>
        {allowNone && selected && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 rounded-lg px-2 py-2 text-xs text-stone-400 active:text-stone-600"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
