"use client";

import { useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
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
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Name">
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="North bed, hoop house 1…"
          />
        </Field>

        <div className="flex gap-2">
          <Field label="Type" className="flex-1">
            <Select value={type} onChange={(e) => setType(e.target.value as LocationType)}>
              {locationTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Zone" className="w-20">
            <Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="6b" />
          </Field>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pb-safe">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={saving}
            disabled={saving || !name.trim()}
          >
            Save pin
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
