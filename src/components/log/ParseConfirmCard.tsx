"use client";

import { useMemo, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/datetime";
import { formatParseSummary, getPostSaveTip } from "@/lib/coach/tips";
import type { ResolvedParse } from "@/lib/parse/schema";
import type { EventType, LocationRecord, PlantingRecord, PlantType } from "@/lib/types";

type ParseConfirmCardProps = {
  rawText: string;
  resolved: ResolvedParse;
  additionalResolved?: ResolvedParse[];
  coachTip?: string;
  locations: LocationRecord[];
  plantings: PlantingRecord[];
  onConfirm: (saveTip: string) => void;
  onCancel: () => void;
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
  { value: "visit", label: "Visit" },
  { value: "other", label: "Other" },
];

const plantTypes: { value: PlantType; label: string }[] = [
  { value: "crop", label: "Crop" },
  { value: "flower", label: "Flower" },
  { value: "tree", label: "Tree" },
  { value: "breeding_line", label: "Breeding line" },
];

function buildEntry(
  rawText: string,
  resolved: ResolvedParse,
  overrides: {
    type: EventType;
    locationId: string;
    plantingId: string;
    occurredAt: string;
    quantity: string;
    unit: string;
    amount: string;
    notes: string;
    createPlanting?: boolean;
    plantType?: PlantType;
    commonName?: string;
    variety?: string;
  },
) {
  return {
    rawText,
    parsedJson: resolved,
    type: overrides.type,
    locationId: overrides.locationId || undefined,
    plantingId: overrides.plantingId || undefined,
    occurredAt: fromLocalInputValue(overrides.occurredAt),
    quantity: overrides.quantity ? Number(overrides.quantity) : undefined,
    unit: overrides.unit || undefined,
    amount: overrides.amount ? Number(overrides.amount) : undefined,
    notes: overrides.notes || undefined,
    createPlanting:
      overrides.createPlanting && overrides.commonName && overrides.locationId
        ? {
            locationId: overrides.locationId,
            plantType: overrides.plantType ?? "crop",
            commonName: overrides.commonName,
            variety: overrides.variety || undefined,
          }
        : undefined,
  };
}

export default function ParseConfirmCard({
  rawText,
  resolved,
  additionalResolved = [],
  coachTip,
  locations,
  plantings,
  onConfirm,
  onCancel,
}: ParseConfirmCardProps) {
  const canSplit = additionalResolved.length > 0;
  const [splitMode, setSplitMode] = useState(canSplit);

  const [type, setType] = useState<EventType>(resolved.type);
  const [locationId, setLocationId] = useState(resolved.locationId ?? "");
  const [plantingId, setPlantingId] = useState(resolved.plantingId ?? "");
  const [occurredAt, setOccurredAt] = useState(toLocalInputValue(resolved.occurredAt));
  const [quantity, setQuantity] = useState(resolved.quantity?.toString() ?? "");
  const [unit, setUnit] = useState(resolved.unit ?? "");
  const [amount, setAmount] = useState(resolved.amount?.toString() ?? "");
  const [notes, setNotes] = useState(resolved.notes ?? "");
  const [createPlanting, setCreatePlanting] = useState(resolved.suggestNewPlanting);
  const [plantType, setPlantType] = useState<PlantType>(resolved.plantType ?? "crop");
  const [commonName, setCommonName] = useState(resolved.commonName ?? "");
  const [variety, setVariety] = useState(resolved.variety ?? "");
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredPlantings = useMemo(
    () => plantings.filter((p) => !locationId || p.locationId === locationId),
    [plantings, locationId],
  );

  const summary = formatParseSummary({
    ...resolved,
    type,
    locationName: locations.find((l) => l.id === locationId)?.name ?? resolved.locationName,
    occurredAt: occurredAt ? fromLocalInputValue(occurredAt) : resolved.occurredAt,
    quantity: quantity ? Number(quantity) : null,
    unit: unit || null,
    amount: amount ? Number(amount) : null,
  });

  async function handleConfirm() {
    setSaving(true);
    setError(null);

    try {
      const primaryEntry = buildEntry(rawText, resolved, {
        type,
        locationId,
        plantingId,
        occurredAt,
        quantity,
        unit,
        amount,
        notes,
        createPlanting,
        plantType,
        commonName,
        variety,
      });

      if (splitMode && canSplit) {
        const extraEntries = additionalResolved.map((item) =>
          buildEntry(rawText, item, {
            type: item.type,
            locationId: item.locationId ?? locationId,
            plantingId: item.plantingId ?? plantingId,
            occurredAt: toLocalInputValue(item.occurredAt),
            quantity: item.quantity?.toString() ?? "",
            unit: item.unit ?? "",
            amount: item.amount?.toString() ?? "",
            notes: item.notes ?? "",
            createPlanting: item.suggestNewPlanting,
            plantType: item.plantType ?? "crop",
            commonName: item.commonName ?? "",
            variety: item.variety ?? "",
          }),
        );

        await apiFetch("/api/log/confirm-batch", {
          method: "POST",
          body: { entries: [primaryEntry, ...extraEntries] },
        });

        const batchCount = 1 + extraEntries.length;
        toast.success(`Saved ${batchCount} entries`);
        onConfirm(`Saved ${batchCount} logs. ${getPostSaveTip(type)}`);
        return;
      }

      await apiFetch("/api/log/confirm", {
        method: "POST",
        body: primaryEntry,
      });

      toast.success("Logged");
      onConfirm(getPostSaveTip(type));
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't save this log.");
      setError(message);
      toast.error("Couldn't save log", { description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onCancel}
      title="Confirm log"
      subtitle="I understood this as:"
    >
        <Callout tone="tip" icon="sparkle">
          <span className="text-base font-medium">{summary}</span>
        </Callout>

        <blockquote className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-xs italic text-stone-600">
          &ldquo;{rawText}&rdquo;
        </blockquote>

        {coachTip && (
          <p className="mt-3 text-xs leading-relaxed text-stone-600">{coachTip}</p>
        )}

        {canSplit && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-900">
              Multiple actions detected ({1 + additionalResolved.length})
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setSplitMode(true)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  splitMode
                    ? "bg-amber-600 text-white"
                    : "bg-white text-amber-800 border border-amber-200"
                }`}
              >
                Split into {1 + additionalResolved.length} logs
              </button>
              <button
                type="button"
                onClick={() => setSplitMode(false)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  !splitMode
                    ? "bg-amber-600 text-white"
                    : "bg-white text-amber-800 border border-amber-200"
                }`}
              >
                One combined log
              </button>
            </div>
            {splitMode && (
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                <li>1. {formatParseSummary(resolved)}</li>
                {additionalResolved.map((item, index) => (
                  <li key={index}>
                    {index + 2}. {formatParseSummary(item)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!splitMode && (
          <div className="mt-4 space-y-3">
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
                <option value="">— pick location —</option>
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
                <option value="">— optional —</option>
                {filteredPlantings.map((planting) => (
                  <option key={planting.id} value={planting.id}>
                    {planting.commonName}
                    {planting.variety ? ` (${planting.variety})` : ""}
                  </option>
                ))}
              </select>
            </label>

            {createPlanting && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-amber-900">
                  <input
                    type="checkbox"
                    checked={createPlanting}
                    onChange={(e) => setCreatePlanting(e.target.checked)}
                  />
                  Create new planting from this log
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={commonName}
                    onChange={(e) => setCommonName(e.target.value)}
                    placeholder="Common name"
                    className="rounded-lg border border-amber-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={variety}
                    onChange={(e) => setVariety(e.target.value)}
                    placeholder="Variety"
                    className="rounded-lg border border-amber-200 px-3 py-2 text-sm"
                  />
                </div>
                <select
                  value={plantType}
                  onChange={(e) => setPlantType(e.target.value as PlantType)}
                  className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
                >
                  {plantTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                rows={2}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <Button
          size="lg"
          fullWidth
          leftIcon="check"
          loading={saving}
          onClick={handleConfirm}
          className="mt-4"
        >
          {splitMode && canSplit
            ? `Save ${1 + additionalResolved.length} logs`
            : "Confirm & save"}
        </Button>
    </BottomSheet>
  );
}
