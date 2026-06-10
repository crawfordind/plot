"use client";

import { useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import type { LocationRecord, PlantType } from "@/lib/types";

type PlantingFormProps = {
  locations: LocationRecord[];
  defaultLocationId?: string | null;
  onSaved: () => void;
  onClose: () => void;
};

const plantTypes: { value: PlantType; label: string }[] = [
  { value: "crop", label: "Crop" },
  { value: "flower", label: "Flower" },
  { value: "tree", label: "Tree" },
  { value: "breeding_line", label: "Breeding line" },
];

export default function PlantingForm({
  locations,
  defaultLocationId,
  onSaved,
  onClose,
}: PlantingFormProps) {
  const [locationId, setLocationId] = useState(
    defaultLocationId ?? locations[0]?.id ?? "",
  );
  const [plantType, setPlantType] = useState<PlantType>("crop");
  const [commonName, setCommonName] = useState("");
  const [variety, setVariety] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/plantings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          plantType,
          commonName,
          variety: variety || undefined,
          source: source || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to save planting");
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save planting");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="New planting">
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs font-medium text-stone-600">
            Location
            <select
              required
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-stone-600">
              Type
              <select
                value={plantType}
                onChange={(e) => setPlantType(e.target.value as PlantType)}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              >
                {plantTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-stone-600">
              Common name
              <input
                required
                value={commonName}
                onChange={(e) => setCommonName(e.target.value)}
                placeholder="Zinnia, chestnut…"
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-stone-600">
              Variety
              <input
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                placeholder="Zin Master"
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-xs font-medium text-stone-600">
              Source
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Eden Brothers"
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={saving || !locationId || !commonName.trim()}
            className="touch-target w-full rounded-2xl bg-emerald-600 py-4 text-base font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create planting"}
          </button>
        </form>
    </BottomSheet>
  );
}
