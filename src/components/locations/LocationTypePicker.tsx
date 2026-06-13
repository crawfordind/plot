"use client";

import { useMemo, useState } from "react";
import {
  LOCATION_CATALOG_ITEMS,
  LOCATION_CATEGORIES,
  type CatalogItem,
  type LocationType,
} from "@/lib/locations/catalog";

type LocationTypePickerProps = {
  value: LocationType;
  onChange: (type: LocationType) => void;
};

// Searchable, categorised picker for "what is this?" — comprehensive (every farm
// feature) but not overwhelming: a search box up top, results grouped by category,
// the current choice highlighted.
export default function LocationTypePicker({
  value,
  onChange,
}: LocationTypePickerProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const matches = (item: CatalogItem) =>
      !q ||
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.type.includes(q);
    return LOCATION_CATEGORIES.map((category) => ({
      category,
      items: LOCATION_CATALOG_ITEMS.filter(
        (i) => i.category === category && matches(i),
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  const selected = LOCATION_CATALOG_ITEMS.find((i) => i.type === value);

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search — pond, barn, gate, bed…"
          className="focus-ring w-full rounded-xl border border-stone-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
          aria-label="Search location types"
        />
      </div>

      {selected && (
        <p className="mt-2 text-xs text-stone-500">
          Selected:{" "}
          <span className="font-medium text-stone-700">
            {selected.emoji} {selected.label}
          </span>
        </p>
      )}

      <div className="mt-2 max-h-64 space-y-3 overflow-y-auto pr-0.5">
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-400">
            No matches for “{query}”.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.category}>
              <p className="px-0.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                {group.category}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((item) => {
                  const isSelected = item.type === value;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => onChange(item.type)}
                      aria-pressed={isSelected}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm active:scale-95 ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-600 font-semibold text-white"
                          : "border-stone-200 bg-white text-stone-700"
                      }`}
                    >
                      <span aria-hidden>{item.emoji}</span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
