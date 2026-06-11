"use client";

import { useState } from "react";
import type { PlantType, VarietyRecord } from "@/lib/types";

type VarietyPickerProps = {
  varieties: VarietyRecord[];
  plantType: PlantType;
  value: string | null; // varietyId
  onChange: (varietyId: string | null, varietyName: string | null) => void;
  onCreated: () => void;
};

// Pick a saved variety (sets plantings.varietyId) or create one inline, so the
// breeding/seed-saving lineage actually links up instead of being free text only.
export default function VarietyPicker({
  varieties,
  plantType,
  value,
  onChange,
  onCreated,
}: VarietyPickerProps) {
  const options = varieties.filter((v) => v.plantType === plantType);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createVariety() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/varieties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), plantType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onChange(data.variety.id, data.variety.name);
      onCreated();
      setCreating(false);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "focus-ring mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm";

  return (
    <div>
      <span className="block text-xs font-medium text-stone-600">
        Saved variety / line (optional)
      </span>
      {creating ? (
        <div className="mt-1 flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New variety name"
            className="focus-ring min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            onClick={createVariety}
            disabled={saving || !name.trim()}
            className="shrink-0 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="shrink-0 rounded-lg px-2 text-sm text-stone-400"
          >
            ✕
          </button>
        </div>
      ) : (
        <select
          value={value ?? ""}
          onChange={(e) => {
            if (e.target.value === "__new__") {
              setCreating(true);
              return;
            }
            const v = options.find((o) => o.id === e.target.value);
            onChange(v?.id ?? null, v?.name ?? null);
          }}
          className={field}
        >
          <option value="">— none —</option>
          {options.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
          <option value="__new__">+ Create new variety…</option>
        </select>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
