"use client";

import type { SeasonRecord } from "@/lib/types";

type SeasonPickerProps = {
  seasons: SeasonRecord[];
  value: string | null;
  onChange: (seasonId: string | null) => void;
};

export default function SeasonPicker({ seasons, value, onChange }: SeasonPickerProps) {
  return (
    <label className="block text-xs font-medium text-stone-600">
      Season (optional)
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="focus-ring mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
      >
        <option value="">— none —</option>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.status === "closed" ? " (closed)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
