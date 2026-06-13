"use client";

import { useState } from "react";
import type { CrossRecord, PlantingRecord } from "@/lib/types";

function label(p: PlantingRecord | undefined | null): string {
  if (!p) return "unknown";
  return `${p.commonName}${p.variety ? ` (${p.variety})` : ""}`;
}

// Shows where this planting sits in the breeding lineage and lets the grower set
// its parent — surfacing parentPlantingId/crosses that were otherwise write-only.
export default function LineageSection({
  planting,
  plantings,
  crosses,
  onChanged,
}: {
  planting: PlantingRecord;
  plantings: PlantingRecord[];
  crosses: CrossRecord[];
  onChanged: () => void;
}) {
  const byId = new Map(plantings.map((p) => [p.id, p]));
  const parent = planting.parentPlantingId
    ? byId.get(planting.parentPlantingId)
    : null;
  const children = plantings.filter((p) => p.parentPlantingId === planting.id);
  const involved = crosses.filter(
    (c) =>
      c.motherPlantingId === planting.id ||
      c.fatherPlantingId === planting.id ||
      c.resultLineId === planting.id,
  );
  const [saving, setSaving] = useState(false);

  async function setParent(parentId: string) {
    setSaving(true);
    try {
      await fetch(`/api/plantings/${planting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPlantingId: parentId || null }),
      });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  const candidates = plantings.filter((p) => p.id !== planting.id);

  return (
    <div className="space-y-3 rounded-2xl border border-stone-100 bg-stone-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
        Lineage
      </p>

      <label className="block text-xs font-medium text-stone-600">
        Parent planting
        <select
          value={planting.parentPlantingId ?? ""}
          onChange={(e) => setParent(e.target.value)}
          disabled={saving}
          className="focus-ring mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
        >
          <option value="">— none —</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {label(p)}
            </option>
          ))}
        </select>
      </label>

      {parent && (
        <p className="text-sm text-stone-600">
          ↑ from <span className="font-medium">{label(parent)}</span>
        </p>
      )}

      {children.length > 0 && (
        <div className="text-sm text-stone-600">
          ↓ offspring:{" "}
          <span className="font-medium">
            {children.map((c) => label(c)).join(", ")}
          </span>
        </div>
      )}

      {involved.length > 0 && (
        <div className="text-sm text-stone-600">
          <p className="text-xs font-medium text-stone-500">Crosses</p>
          <ul className="mt-1 space-y-0.5">
            {involved.map((c) => (
              <li key={c.id}>
                {label(byId.get(c.motherPlantingId))} ✕{" "}
                {label(byId.get(c.fatherPlantingId))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!parent && children.length === 0 && involved.length === 0 && (
        <p className="text-sm text-stone-400">
          No lineage yet — set a parent above, or record a cross from the log bar.
        </p>
      )}
    </div>
  );
}
