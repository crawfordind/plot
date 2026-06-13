"use client";

import { useState } from "react";
import PaddockConfigSheet from "@/components/grazing/PaddockConfigSheet";
import { useMapInteraction } from "@/components/map/MapInteractionContext";
import { StatusDot } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Icon from "@/components/ui/Icon";
import type { GrazingSnapshot, PaddockState } from "@/lib/grazing/status";
import type { PaddockRecord, PaddockStatus } from "@/lib/types";

type GrazingAdvisorProps = {
  snapshot: GrazingSnapshot | null;
  paddockConfigs: PaddockRecord[];
  onChanged: () => void;
  onGoToPlan: () => void;
  onGoToMove: () => void;
};

type Tone = "emerald" | "sky" | "amber" | "stone";

const STATUS_STYLE: Record<
  PaddockStatus,
  { label: string; tone: Tone; chip: string }
> = {
  grazing: { label: "Grazing now", tone: "sky", chip: "bg-sky-100 text-sky-800" },
  ready: { label: "Ready", tone: "emerald", chip: "bg-emerald-100 text-emerald-800" },
  resting: { label: "Resting", tone: "amber", chip: "bg-amber-100 text-amber-800" },
  idle: { label: "Not grazed", tone: "stone", chip: "bg-stone-100 text-stone-600" },
};

const ADVISORY_TONE = {
  move: "success",
  warning: "warn",
  setup: "info",
  info: "info",
} as const;

function paddockSubline(p: PaddockState): string {
  const bits: string[] = [];
  if (p.status === "grazing" && p.daysOn != null) {
    bits.push(`${p.daysOn} day${p.daysOn === 1 ? "" : "s"} on`);
  } else if (p.status === "resting" && p.restDays != null) {
    const target = p.restTargetDays != null ? ` / ${p.restTargetDays}` : "";
    bits.push(`rested ${p.restDays}${target} days`);
  } else if (p.status === "ready" && p.restDays != null) {
    bits.push(`rested ${p.restDays} days`);
  }
  if (p.acres > 0) bits.push(`${p.acres.toFixed(2)} ac`);
  if (p.primaryForage) bits.push(p.primaryForage);
  return bits.join(" · ");
}

export default function GrazingAdvisor({
  snapshot,
  paddockConfigs,
  onChanged,
  onGoToPlan,
  onGoToMove,
}: GrazingAdvisorProps) {
  const { beginDrag, startDrawPaddock } = useMapInteraction();
  const [editing, setEditing] = useState<PaddockState | null>(null);

  if (!snapshot) {
    return <p className="text-sm text-stone-500">Loading…</p>;
  }

  const { advisories, paddocks, herds } = snapshot;

  return (
    <div className="space-y-4">
      {herds.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">
            Drag a herd onto a paddock to move it
          </p>
          <div className="flex flex-wrap gap-2">
            {herds.map((h) => (
              <span
                key={h.herdId}
                onPointerDown={(e) =>
                  beginDrag(
                    {
                      kind: "herd",
                      id: h.herdId,
                      label: h.name,
                      fromLocationId: h.currentLocationId,
                    },
                    e,
                  )
                }
                className="flex cursor-grab touch-none select-none items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 active:cursor-grabbing active:bg-emerald-100"
              >
                <span className="text-emerald-400">
                  <Icon name="grip" size={14} />
                </span>
                {h.name}
                <span className="text-xs text-emerald-600">
                  {h.currentLocationName ? `· ${h.currentLocationName}` : "· off"}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        {advisories.map((a) => (
          <Callout key={a.id} tone={ADVISORY_TONE[a.kind] ?? "info"}>
            {a.message}
            {a.kind === "setup" && a.id === "setup-paddocks" && (
              <button
                type="button"
                onClick={onGoToPlan}
                className="mt-1 block text-sm font-semibold underline"
              >
                Open the planner →
              </button>
            )}
            {a.kind === "move" && (
              <button
                type="button"
                onClick={onGoToMove}
                className="mt-1 block text-sm font-semibold underline"
              >
                Log this move →
              </button>
            )}
          </Callout>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Paddocks ({paddocks.length})
          </p>
          <Button variant="subtle" size="sm" leftIcon="penDraw" onClick={startDrawPaddock}>
            Draw
          </Button>
        </div>
        {paddocks.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500">
            <span className="flex items-center gap-1">
              <StatusDot tone="sky" /> Grazing
            </span>
            <span className="flex items-center gap-1">
              <StatusDot tone="emerald" /> Ready
            </span>
            <span className="flex items-center gap-1">
              <StatusDot tone="amber" /> Resting
            </span>
            <span className="flex items-center gap-1">
              <StatusDot tone="stone" /> Not grazed
            </span>
          </div>
        )}
        {paddocks.length > 0 && (
          <ul className="space-y-1.5">
            {paddocks.map((p) => {
              const style = STATUS_STYLE[p.status];
              return (
                <li key={p.locationId}>
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="flex w-full items-center justify-between gap-2 rounded-2xl border border-stone-100 bg-white px-3 py-2.5 text-left active:bg-stone-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <StatusDot tone={style.tone} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-stone-800">
                          {p.name}
                        </span>
                        <span className="block truncate text-xs text-stone-500">
                          {paddockSubline(p) || "Tap to set forage & rest target"}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.chip}`}
                    >
                      {style.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <PaddockConfigSheet
          locationId={editing.locationId}
          name={editing.name}
          config={
            paddockConfigs.find((c) => c.locationId === editing.locationId) ?? null
          }
          onSaved={onChanged}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
