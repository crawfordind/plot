"use client";

import { useState } from "react";
import DeleteButton from "@/components/ui/DeleteButton";
import Sheet from "@/components/ui/Sheet";
import type { LocationRecord, PlantingRecord, PlantingStatus, PlantType } from "@/lib/types";

type PlantingEditSheetProps = {
  planting: PlantingRecord;
  locations: LocationRecord[];
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
};

const plantTypes: { value: PlantType; label: string }[] = [
  { value: "crop", label: "Crop" },
  { value: "flower", label: "Flower" },
  { value: "tree", label: "Tree" },
  { value: "breeding_line", label: "Breeding line" },
];

const statuses: { value: PlantingStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "harvested", label: "Harvested" },
  { value: "archived", label: "Archived" },
];

export default function PlantingEditSheet({
  planting,
  locations,
  onSaved,
  onDeleted,
  onClose,
}: PlantingEditSheetProps) {
  const [locationId, setLocationId] = useState(planting.locationId);
  const [plantType, setPlantType] = useState<PlantType>(planting.plantType);
  const [commonName, setCommonName] = useState(planting.commonName);
  const [variety, setVariety] = useState(planting.variety ?? "");
  const [source, setSource] = useState(planting.source ?? "");
  const [status, setStatus] = useState<PlantingStatus>(planting.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/plantings/${planting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          plantType,
          commonName,
          variety: variety || undefined,
          source: source || undefined,
          status,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to update");
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const response = await fetch(`/api/plantings/${planting.id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error ?? "Failed to delete");
    }
    onDeleted();
    onClose();
  }

  return (
    <Sheet
      title="Edit planting"
      onClose={onClose}
      footer={<DeleteButton onDelete={handleDelete} />}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-xs font-medium text-stone-600">
          Location
          <select
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
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PlantingStatus)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            >
              {statuses.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-xs font-medium text-stone-600">
          Common name
          <input
            required
            value={commonName}
            onChange={(e) => setCommonName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-stone-600">
            Variety
            <input
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-xs font-medium text-stone-600">
            Source
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving || !commonName.trim()}
          className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Sheet>
  );
}
