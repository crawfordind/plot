"use client";

import { useState } from "react";
import LocationField from "@/components/map/LocationField";
import { useMapInteraction } from "@/components/map/MapInteractionContext";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import type { EventRecord, EventType, LocationRecord, PlantingRecord } from "@/lib/types";

type EventEditSheetProps = {
  event: EventRecord;
  locations: LocationRecord[];
  plantings: PlantingRecord[];
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
};

const eventTypes: { value: EventType; label: string }[] = [
  { value: "sow", label: "Sow" },
  { value: "transplant", label: "Transplant" },
  { value: "water", label: "Water" },
  { value: "amend", label: "Amend" },
  { value: "observe", label: "Observe" },
  { value: "harvest", label: "Harvest" },
  { value: "cross", label: "Cross" },
  { value: "seed_save", label: "Save seed" },
  { value: "sale", label: "Sale" },
  { value: "cost", label: "Cost" },
  { value: "other", label: "Other" },
];

export default function EventEditSheet({
  event,
  locations,
  plantings,
  onSaved,
  onDeleted,
  onClose,
}: EventEditSheetProps) {
  const toast = useToast();
  const { picking } = useMapInteraction();
  const [type, setType] = useState<EventType>(event.type);
  const [locationId, setLocationId] = useState(event.locationId ?? "");
  const [plantingId, setPlantingId] = useState(event.plantingId ?? "");
  const [occurredAt, setOccurredAt] = useState(event.occurredAt.slice(0, 16));
  const [quantity, setQuantity] = useState(event.quantity?.toString() ?? "");
  const [unit, setUnit] = useState(event.unit ?? "");
  const [amount, setAmount] = useState(event.amount?.toString() ?? "");
  const [notes, setNotes] = useState(event.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredPlantings = plantings.filter(
    (p) => !locationId || p.locationId === locationId,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await apiFetch(`/api/events/${event.id}`, {
        method: "PATCH",
        body: {
          type,
          locationId: locationId || undefined,
          plantingId: plantingId || undefined,
          occurredAt: new Date(occurredAt).toISOString(),
          quantity: quantity ? Number(quantity) : undefined,
          unit: unit || undefined,
          amount: amount ? Number(amount) : undefined,
          notes: notes || undefined,
        },
      });

      toast.success("Log updated");
      onSaved();
      onClose();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't update this log.");
      setError(message);
      toast.error("Couldn't update log", { description: message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await apiFetch(`/api/events/${event.id}`, { method: "DELETE" });
      toast.success("Log deleted");
      onDeleted();
      onClose();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't delete this log.");
      setError(message);
      toast.error("Couldn't delete log", { description: message });
    }
  }

  return (
    <Sheet
      title="Edit log"
      onClose={onClose}
      footer={<DeleteButton onDelete={handleDelete} />}
      hidden={picking}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-stone-600">
            Action
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EventType)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            >
              {eventTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-stone-600">
            When
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <LocationField
          locations={locations}
          value={locationId}
          onChange={(id) => {
            setLocationId(id);
            setPlantingId("");
          }}
          pickTitle="Tap this log's location"
          placeholder="— none —"
          allowNone
        />

        <label className="block text-xs font-medium text-stone-600">
          Planting
          <select
            value={plantingId}
            onChange={(e) => setPlantingId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
          >
            <option value="">— none —</option>
            {filteredPlantings.map((planting) => (
              <option key={planting.id} value={planting.id}>
                {planting.commonName}
                {planting.variety ? ` (${planting.variety})` : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="block text-xs font-medium text-stone-600">
            Qty
            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Unit
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            Amount ($)
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block text-xs font-medium text-stone-600">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <Button type="submit" fullWidth loading={saving}>
          Save changes
        </Button>
      </form>
    </Sheet>
  );
}
