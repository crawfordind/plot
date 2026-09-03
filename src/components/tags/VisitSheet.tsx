"use client";

import { useMemo, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import {
  clampHeightCm,
  cmToDisplay,
  displayToCm,
  roundForUnit,
  stepFor,
  unitLabel,
} from "@/lib/tags/units";
import type {
  DamageKind,
  EventRecord,
  HeightRef,
  HeightUnit,
  Survival,
} from "@/lib/types";

// The 20-second form. Three taps is a complete record — alive, height, damage —
// and everything about the layout serves that: nothing under 52px, the previous
// height carried forward so the common case is a nudge rather than a number, and
// reference chips instead of a keyboard nobody can use with gloves on.

const SURVIVAL: { id: Survival; label: string }[] = [
  { id: "alive", label: "Alive" },
  { id: "dead", label: "Dead" },
  { id: "missing", label: "Missing" },
];

const HEIGHT_REFS: { id: HeightRef; label: string }[] = [
  { id: "above_tube", label: "above tube" },
  { id: "at_tube_top", label: "at tube top" },
  { id: "inside", label: "inside" },
];

const DAMAGE: { id: DamageKind; label: string }[] = [
  { id: "browse", label: "Deer browse" },
  { id: "rodent", label: "Rodent girdle" },
  { id: "insect", label: "Insect" },
  { id: "tube_down", label: "Tube down" },
];

type VisitSheetProps = {
  open: boolean;
  onClose: () => void;
  tagCode: string;
  locationName: string;
  crewName: string | null;
  heightUnit: HeightUnit;
  // The most recent visit, if any — the source of the carried-forward height.
  lastVisit: EventRecord | null;
  position: { lat: number; lng: number } | null;
  readVia?: "nfc" | "qr" | "manual";
  // Called after a successful save. `scanNext` distinguishes the two exits:
  // "Save & scan next" keeps the reader armed for the next tube.
  onSaved: (event: EventRecord, scanNext: boolean) => void;
  // Hands the raw text path to the app's existing NL parser.
  onDictate?: () => void;
  onTakePhoto?: () => void;
};

export default function VisitSheet({
  open,
  onClose,
  tagCode,
  locationName,
  crewName,
  heightUnit,
  lastVisit,
  position,
  readVia = "nfc",
  onSaved,
  onDictate,
  onTakePhoto,
}: VisitSheetProps) {
  const toast = useToast();
  const lastHeightCm = lastVisit?.heightCm ?? null;

  const [survival, setSurvival] = useState<Survival>("alive");
  // Held as a display-unit string so typing feels normal; converted to
  // centimetres only on save.
  const [height, setHeight] = useState<string>(() =>
    lastHeightCm == null
      ? ""
      : String(roundForUnit(cmToDisplay(lastHeightCm, heightUnit), heightUnit)),
  );
  const [heightRef, setHeightRef] = useState<HeightRef | null>(null);
  const [damage, setDamage] = useState<DamageKind[]>([]);
  const [noDamage, setNoDamage] = useState(false);
  const [saving, setSaving] = useState(false);

  const step = stepFor(heightUnit);
  const label = unitLabel(heightUnit);

  const lastLabel = useMemo(() => {
    if (lastHeightCm == null) return null;
    return `last ${roundForUnit(cmToDisplay(lastHeightCm, heightUnit), heightUnit)} ${label}`;
  }, [lastHeightCm, heightUnit, label]);

  function nudge(delta: number) {
    const current = Number(height);
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, roundForUnit(base + delta, heightUnit));
    setHeight(String(next));
  }

  function toggleDamage(kind: DamageKind) {
    setNoDamage(false);
    setDamage((list) =>
      list.includes(kind) ? list.filter((d) => d !== kind) : [...list, kind],
    );
  }

  // A dead or missing tree has no height to record, so the measurement block
  // stops asking for one rather than inviting a meaningless number.
  const measurable = survival === "alive";

  async function save(scanNext: boolean) {
    setSaving(true);
    try {
      const typed = Number(height);
      const heightCm =
        measurable && height.trim() !== "" && Number.isFinite(typed)
          ? clampHeightCm(displayToCm(typed, heightUnit))
          : undefined;

      const { event } = await apiFetch<{ event: EventRecord }>(
        `/api/tags/${tagCode}/visits`,
        {
          method: "POST",
          body: {
            survival,
            ...(heightCm !== undefined ? { heightCm } : {}),
            ...(measurable && heightRef ? { heightRef } : {}),
            ...(damage.length ? { damage } : {}),
            readVia,
            ...(position ? { lat: position.lat, lng: position.lng } : {}),
          },
        },
      );
      onSaved(event, scanNext);
    } catch (error) {
      toast.error("Couldn't save that visit", {
        description: getErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Visit · ${locationName}`}
      subtitle={crewName ? `${today} · ${crewName}` : today}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            fullWidth
            loading={saving}
            onClick={() => save(true)}
            className="min-h-[60px] rounded-[18px] text-lg"
          >
            Save &amp; scan next
          </Button>
          <div className="flex items-center justify-between text-xs text-stone-400">
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving}
              className="focus-ring rounded-lg font-medium text-stone-500 disabled:opacity-50"
            >
              Save and stop
            </button>
            <span>{lastVisit ? "History carried forward" : "First visit"}</span>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <span className="block text-xs font-medium text-stone-600">Is it alive?</span>
          <div className="mt-1.5 flex gap-2">
            {SURVIVAL.map((option) => {
              const active = survival === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSurvival(option.id)}
                  className={`focus-ring min-h-[64px] flex-1 rounded-2xl text-[17px] transition-colors ${
                    active
                      ? "bg-emerald-600 font-bold text-white"
                      : "border border-stone-200 bg-white font-semibold text-stone-600"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {measurable && (
          <div>
            <span className="flex items-center gap-1.5 text-xs font-medium text-stone-600">
              Height
              {lastLabel && (
                <span className="rounded-full bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-stone-500">
                  {lastLabel}
                </span>
              )}
            </span>
            <div className="mt-1.5 flex gap-2">
              <div className="flex flex-1 items-center rounded-xl border border-emerald-200 bg-white px-3">
                <input
                  value={height}
                  onChange={(e) => setHeight(e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  aria-label={`Height in ${label}`}
                  placeholder="—"
                  className="focus-ring w-full bg-transparent py-3 font-mono text-xl font-semibold text-stone-900 outline-none"
                />
                <span className="ml-1.5 shrink-0 text-sm font-medium text-stone-400">
                  {label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => nudge(-step)}
                aria-label={`Decrease by ${step} ${label}`}
                className="focus-ring min-h-[52px] w-14 rounded-xl border border-stone-200 bg-white text-xl font-semibold text-stone-600"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => nudge(step)}
                aria-label={`Increase by ${step} ${label}`}
                className="focus-ring min-h-[52px] w-14 rounded-xl border border-stone-200 bg-white text-xl font-semibold text-stone-600"
              >
                +
              </button>
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {HEIGHT_REFS.map((ref) => {
                const active = heightRef === ref.id;
                return (
                  <button
                    key={ref.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setHeightRef(active ? null : ref.id)}
                    className={`focus-ring rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-emerald-600 text-white"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {ref.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <span className="block text-xs font-medium text-stone-600">Damage seen</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DAMAGE.map((option) => {
              const active = damage.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDamage(option.id)}
                  className={`focus-ring rounded-full px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
                    active ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={noDamage}
              onClick={() => {
                setDamage([]);
                setNoDamage((v) => !v);
              }}
              className={`focus-ring rounded-full px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${
                noDamage ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-600"
              }`}
            >
              None
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onTakePhoto}
            disabled={!onTakePhoto}
            className="focus-ring flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-sm font-semibold text-stone-600 disabled:opacity-40"
          >
            <Icon name="camera" size={18} />
            Photo
          </button>
          <button
            type="button"
            onClick={onDictate}
            disabled={!onDictate}
            className="focus-ring flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-sm font-semibold text-stone-600 disabled:opacity-40"
          >
            <Icon name="sparkle" size={18} />
            Say it instead
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
