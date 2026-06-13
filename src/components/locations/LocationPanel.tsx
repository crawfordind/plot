"use client";

import { useState } from "react";
import LocationTypePicker from "@/components/locations/LocationTypePicker";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { locationTypeLabel } from "@/lib/locations/catalog";
import type { LocationType } from "@/lib/types";

type LocationPanelProps = {
  pendingCoords: [number, number] | null;
  // Farm under the current viewport — new non-farm pins are placed inside it.
  defaultParentId: string | null;
  onCancel: () => void;
  onCreated: () => void;
};

export default function LocationPanel({
  pendingCoords,
  defaultParentId,
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
          // A new farm is top-level; everything else lands in the current farm.
          parentId: type === "farm" ? undefined : defaultParentId ?? undefined,
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
        <Field label="What is it?">
          <LocationTypePicker value={type} onChange={setType} />
        </Field>

        <div className="flex gap-2">
          <Field label="Name" className="flex-1">
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${locationTypeLabel(type)} 1`}
            />
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
