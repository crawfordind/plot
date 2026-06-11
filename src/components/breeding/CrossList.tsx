"use client";

import EmptyState from "@/components/ui/EmptyState";
import type { CrossRecord, PlantingRecord } from "@/lib/types";

function label(p: PlantingRecord | undefined): string {
  if (!p) return "unknown";
  return `${p.commonName}${p.variety ? ` (${p.variety})` : ""}`;
}

export default function CrossList({
  crosses,
  plantings,
}: {
  crosses: CrossRecord[];
  plantings: PlantingRecord[];
}) {
  const byId = new Map(plantings.map((p) => [p.id, p]));

  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-400">
        Record a cross from the log bar or manual form (action “Cross”). They show
        up here and in each parent&apos;s lineage.
      </p>
      {crosses.length === 0 ? (
        <EmptyState
          icon="cross"
          title="No crosses recorded yet"
          description="Log a cross from the log bar or manual form (action “Cross”) and it appears here and in each parent's lineage."
        />
      ) : (
        <ul className="space-y-2">
          {crosses.map((c) => (
            <li key={c.id} className="rounded-xl border border-stone-100 px-4 py-3">
              <p className="text-sm font-medium text-stone-900">
                {label(byId.get(c.motherPlantingId))} ✕{" "}
                {label(byId.get(c.fatherPlantingId))}
              </p>
              <p className="text-xs text-stone-500">
                {new Date(c.occurredAt).toLocaleDateString()}
                {c.resultLineId ? ` · → ${label(byId.get(c.resultLineId))}` : ""}
              </p>
              {c.notes && <p className="mt-1 text-sm text-stone-600">{c.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
