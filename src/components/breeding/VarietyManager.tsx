"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import type { PlantType, VarietyRecord } from "@/lib/types";

const PLANT_TYPES: { value: PlantType; label: string }[] = [
  { value: "crop", label: "Crop" },
  { value: "flower", label: "Flower" },
  { value: "tree", label: "Tree" },
  { value: "breeding_line", label: "Breeding line" },
];

export default function VarietyManager({
  varieties,
  onChanged,
}: {
  varieties: VarietyRecord[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [plantType, setPlantType] = useState<PlantType>("crop");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const trimmedName = name.trim();
    try {
      await apiFetch<{ variety: VarietyRecord }>("/api/varieties", {
        method: "POST",
        body: {
          name: trimmedName,
          plantType,
          notes: notes.trim() || undefined,
        },
      });
      toast.success(`${trimmedName} added`);
      setName("");
      setNotes("");
      onChanged();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't add this variety.");
      toast.error("Couldn't add variety", { description: message });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const variety = varieties.find((v) => v.id === id);
    try {
      await apiFetch(`/api/varieties/${id}`, { method: "DELETE" });
      toast.success(`${variety?.name ?? "Variety"} deleted`);
      onChanged();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't delete this variety.");
      toast.error("Couldn't delete variety", { description: message });
    }
  }

  const field =
    "focus-ring rounded-xl border border-stone-200 px-3 py-2.5 text-sm";

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-2">
        <p className="text-sm font-semibold text-emerald-900">Add a variety / line</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cherokee Purple, Cross #3 F2"
          className={`w-full ${field}`}
        />
        <div className="flex gap-2">
          <select
            value={plantType}
            onChange={(e) => setPlantType(e.target.value as PlantType)}
            className={`flex-1 ${field}`}
          >
            {PLANT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <Button
            onClick={add}
            loading={saving}
            disabled={saving || !name.trim()}
            className="shrink-0"
          >
            Add
          </Button>
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className={`w-full ${field}`}
        />
      </div>

      {varieties.length === 0 ? (
        <EmptyState
          icon="leaf"
          title="No varieties yet"
          description="Save a named variety or breeding line so plantings and crosses can link to it."
        />
      ) : (
        <ul className="space-y-2">
          {varieties.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-stone-900">{v.name}</p>
                <p className="truncate text-xs text-stone-500">
                  {v.plantType.replace("_", " ")}
                  {v.notes ? ` · ${v.notes}` : ""}
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                leftIcon="trash"
                onClick={() => remove(v.id)}
                className="shrink-0"
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
