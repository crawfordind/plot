"use client";

import { useState } from "react";
import LocationField from "@/components/map/LocationField";
import { useMapInteraction } from "@/components/map/MapInteractionContext";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import type { EventType, LocationRecord, PlantingRecord } from "@/lib/types";

type EventFormProps = {
  locations: LocationRecord[];
  plantings: PlantingRecord[];
  defaultLocationId?: string | null;
  onSaved: () => void;
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

export default function EventForm({
  locations,
  plantings,
  defaultLocationId,
  onSaved,
  onClose,
}: EventFormProps) {
  const { picking } = useMapInteraction();
  const [type, setType] = useState<EventType>("observe");
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [plantingId, setPlantingId] = useState("");
  const [motherPlantingId, setMotherPlantingId] = useState("");
  const [fatherPlantingId, setFatherPlantingId] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
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
      const response = await fetch("/api/events", {
        method: "POST",
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
        throw new Error(data.error ?? "Failed to save event");
      }

      // A cross also records a parent×parent entry so it shows in lineage.
      if (type === "cross" && motherPlantingId && fatherPlantingId) {
        await fetch("/api/crosses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            motherPlantingId,
            fatherPlantingId,
            occurredAt: new Date(occurredAt).toISOString(),
            notes: notes || undefined,
          }),
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="Manual log" hidden={picking}>
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
            pickTitle="Tap where this happened"
            placeholder="— optional —"
            allowNone
          />

          <label className="block text-xs font-medium text-stone-600">
            Planting
            <select
              value={plantingId}
              onChange={(e) => setPlantingId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            >
              <option value="">— optional —</option>
              {filteredPlantings.map((planting) => (
                <option key={planting.id} value={planting.id}>
                  {planting.commonName}
                  {planting.variety ? ` (${planting.variety})` : ""}
                </option>
              ))}
            </select>
          </label>

          {type === "cross" && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <label className="block text-xs font-medium text-stone-600">
                Mother (seed)
                <select
                  value={motherPlantingId}
                  onChange={(e) => setMotherPlantingId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="">— select —</option>
                  {plantings.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.commonName}
                      {p.variety ? ` (${p.variety})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-stone-600">
                Father (pollen)
                <select
                  value={fatherPlantingId}
                  onChange={(e) => setFatherPlantingId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                >
                  <option value="">— select —</option>
                  {plantings.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.commonName}
                      {p.variety ? ` (${p.variety})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

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
                placeholder="lb, bunches…"
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
              placeholder="What happened?"
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <Button type="submit" size="lg" fullWidth loading={saving}>
            Save log
          </Button>
        </form>
    </BottomSheet>
  );
}
