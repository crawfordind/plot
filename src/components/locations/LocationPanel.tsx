"use client";

import { useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import type { LocationType } from "@/lib/types";

type LocationPanelProps = {
  pendingCoords: [number, number] | null;
  onCancel: () => void;
  onCreated: () => void;
};

const locationTypes: { value: LocationType; label: string }[] = [
  { value: "farm", label: "Farm" },
  { value: "field", label: "Field" },
  { value: "zone", label: "Zone" },
  { value: "hoophouse", label: "Hoop house" },
  { value: "bed", label: "Bed" },
  { value: "row", label: "Row" },
  { value: "alley", label: "Alley" },
  { value: "fence", label: "Fence" },
];

export default function LocationPanel({
  pendingCoords,
  onCancel,
  onCreated,
}: LocationPanelProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("bed");
  const [zone, setZone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pendingCoords) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          zone: zone || undefined,
          geometry: {
            type: "Point",
            coordinates: pendingCoords,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to save location");
      }

      setName("");
      setZone("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onCancel}
      title="New location"
      subtitle={`${pendingCoords[1].toFixed(5)}, ${pendingCoords[0].toFixed(5)}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="North bed, hoop house 1…"
          className="w-full rounded-xl border border-stone-200 px-4 py-3 outline-none focus:border-emerald-500"
        />

        <div className="flex gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LocationType)}
            className="min-h-[48px] flex-1 rounded-xl border border-stone-200 px-3 outline-none focus:border-emerald-500"
          >
            {locationTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="6b"
            className="w-20 rounded-xl border border-stone-200 px-3 outline-none focus:border-emerald-500"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pb-safe">
          <button
            type="button"
            onClick={onCancel}
            className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="touch-target flex-1 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save pin"}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
