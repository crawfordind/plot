"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import { Field, Input, Select } from "@/components/ui/Field";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
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
  const toast = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await apiFetch(`/api/locations/${location.id}`, {
        method: "PATCH",
        body: { name, type, zone: zone || undefined },
      });

      toast.success("Location updated");
      onSaved();
      onClose();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't update this location.");
      setError(message);
      toast.error("Couldn't update location", { description: message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await apiFetch(`/api/locations/${location.id}`, { method: "DELETE" });
      toast.success(`${location.name} deleted`);
      onDeleted();
      onClose();
    } catch (err) {
      // Keep the sheet open on failure; the toast carries the reason.
      toast.error("Couldn't delete location", { description: getErrorMessage(err) });
    }
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
        <Field label="Name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as LocationType)}
            >
              {locationTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Zone">
            <Input
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="6b"
            />
          </Field>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <Button type="submit" fullWidth loading={saving} disabled={saving || !name.trim()}>
          Save changes
        </Button>
      </form>
    </Sheet>
  );
}
