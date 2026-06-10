"use client";

import { useState } from "react";
import DeleteButton from "@/components/ui/DeleteButton";
import Sheet from "@/components/ui/Sheet";
import type { LocationRecord, LocationType } from "@/lib/types";

type LocationEditSheetProps = {
  location: LocationRecord;
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
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

export default function LocationEditSheet({
  location,
  onSaved,
  onDeleted,
  onClose,
}: LocationEditSheetProps) {
  const [name, setName] = useState(location.name);
  const [type, setType] = useState<LocationType>(location.type);
  const [zone, setZone] = useState(location.zone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/locations/${location.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, zone: zone || undefined }),
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
    const response = await fetch(`/api/locations/${location.id}`, {
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
      title="Edit location"
      subtitle="Updates name and zone. Pin position stays on the map."
      onClose={onClose}
      footer={
        <DeleteButton
          label="Delete location"
          confirmLabel="Delete — removes plantings too"
          onDelete={handleDelete}
        />
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-xs font-medium text-stone-600">
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-stone-600">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as LocationType)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            >
              {locationTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-stone-600">
            Zone
            <input
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="6b"
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Sheet>
  );
}
