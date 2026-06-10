"use client";

import { useState } from "react";
import DeleteButton from "@/components/ui/DeleteButton";
import Sheet from "@/components/ui/Sheet";
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
      const response = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          locationId: locationId || undefined,
          plantingId: plantingId || undefined,
          occurredAt: new Date(occurredAt).toISOString(),
          quantity: quantity ? Number(quantity) : undefined,
          unit: unit || undefined,
          amount: amount ? Number(amount) : undefined,
          notes: notes || undefined,
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
    const response = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error ?? "Failed to delete");
    }
    onDeleted();
    onClose();
  }

  return (
    <Sheet title="Edit log" onClose={onClose} footer={<DeleteButton onDelete={handleDelete} />}>
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

        <label className="block text-xs font-medium text-stone-600">
          Location
          <select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setPlantingId("");
            }}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
          >
            <option value="">— none —</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

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

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Sheet>
  );
}
