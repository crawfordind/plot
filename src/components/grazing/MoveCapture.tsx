"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { Input, Textarea } from "@/components/ui/Field";
import type { GrazingSnapshot } from "@/lib/grazing/status";
import type { HerdRecord, LocationRecord } from "@/lib/types";

type Resolved = {
  action: string;
  herdId: string | null;
  herdName: string | null;
  toLocationId: string | null;
  toLocationName: string | null;
  occurredAt: string | null;
  heightInIn: number | null;
  heightOutIn: number | null;
  forageSpecies: string | null;
  notes: string | null;
};

type MoveCaptureProps = {
  herds: HerdRecord[];
  locations: LocationRecord[];
  snapshot: GrazingSnapshot | null;
  onMoved: () => void;
  onNeedSetup: () => void;
};

const examples = [
  "Moved the sheep onto Paddock 2 today, grass about 7 inches",
  "Took the flock off Paddock 1, down to 3 inches",
  "Horses onto Paddock 3 this morning",
];

export default function MoveCapture({
  herds,
  locations,
  snapshot,
  onMoved,
  onNeedSetup,
}: MoveCaptureProps) {
  const paddocks = locations.filter((l) => l.type === "paddock");
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [clarifyAnswer, setClarifyAnswer] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [saving, setSaving] = useState(false);

  if (herds.length === 0 || paddocks.length === 0) {
    return (
      <Callout tone="info">
        {herds.length === 0
          ? "Add a herd first so moves know what's grazing."
          : "Create some paddocks first — use the Plan tab to subdivide a field."}
        <Button
          fullWidth
          onClick={onNeedSetup}
          className="mt-3"
          leftIcon={herds.length === 0 ? "herd" : "paddock"}
        >
          {herds.length === 0 ? "Add a herd" : "Open planner"}
        </Button>
      </Callout>
    );
  }

  async function runParse(rawText: string, answer?: string) {
    setParsing(true);
    setError(null);
    try {
      const response = await fetch("/api/grazing/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, clarification: answer }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not read that");

      if (data.clarifyingQuestion && !answer) {
        setPendingText(rawText);
        setClarification(data.clarifyingQuestion);
        return;
      }
      setClarification(null);
      setClarifyAnswer("");
      setPendingText("");
      setResolved(data.resolved as Resolved);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that");
    } finally {
      setParsing(false);
    }
  }

  async function handleApply() {
    if (!resolved) return;
    if (!resolved.herdId) {
      setError("Pick a herd.");
      return;
    }
    // No destination = move OFF pasture (closes the herd's current period).
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/grazing/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          herdId: resolved.herdId,
          toLocationId: resolved.toLocationId ?? undefined,
          occurredAt: resolved.occurredAt ?? undefined,
          heightInIn: resolved.toLocationId
            ? (resolved.heightInIn ?? undefined)
            : undefined,
          heightOutIn: resolved.heightOutIn ?? undefined,
          forageSpecies: resolved.forageSpecies ?? undefined,
          notes: resolved.notes ?? undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to record move");
      setResolved(null);
      onMoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record move");
    } finally {
      setSaving(false);
    }
  }

  if (resolved) {
    const herdOnTarget = snapshot?.herds.find((h) => h.herdId === resolved.herdId);
    const select =
      "mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-emerald-500";
    return (
      <div className="space-y-3">
        <p className="text-xs text-stone-500">Confirm the move and adjust anything I misread.</p>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600">Herd</label>
            <select
              value={resolved.herdId ?? ""}
              onChange={(e) =>
                setResolved({ ...resolved, herdId: e.target.value || null })
              }
              className={select}
            >
              <option value="">Select herd…</option>
              {herds.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            {herdOnTarget?.currentLocationName && (
              <p className="mt-1 text-xs text-stone-500">
                Currently on {herdOnTarget.currentLocationName} — will be moved off.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600">
              Move onto paddock
            </label>
            <select
              value={resolved.toLocationId ?? ""}
              onChange={(e) =>
                setResolved({ ...resolved, toLocationId: e.target.value || null })
              }
              className={select}
            >
              <option value="">— Off pasture (remove from grazing) —</option>
              {paddocks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600">
                Height on (in)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={resolved.heightInIn ?? ""}
                onChange={(e) =>
                  setResolved({
                    ...resolved,
                    heightInIn: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className={select}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600">
                Height off prev (in)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={resolved.heightOutIn ?? ""}
                onChange={(e) =>
                  setResolved({
                    ...resolved,
                    heightOutIn: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className={select}
              />
            </div>
          </div>

          {resolved.notes && (
            <p className="text-xs text-stone-500">Notes: {resolved.notes}</p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setResolved(null)}>
            Back
          </Button>
          <Button
            size="lg"
            className="flex-[2]"
            leftIcon="check"
            loading={saving}
            onClick={handleApply}
          >
            Record move
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {clarification ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (clarifyAnswer.trim()) runParse(pendingText, clarifyAnswer.trim());
          }}
          className="rounded-2xl border border-amber-200 bg-amber-50 p-3"
        >
          <p className="text-sm font-medium text-amber-900">{clarification}</p>
          <Input
            autoFocus
            value={clarifyAnswer}
            onChange={(e) => setClarifyAnswer(e.target.value)}
            placeholder="Your answer…"
            className="mt-2"
          />
          <Button
            type="submit"
            fullWidth
            className="mt-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-700"
            loading={parsing}
            disabled={parsing || !clarifyAnswer.trim()}
          >
            Continue
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !parsing) runParse(text.trim());
          }}
          className="space-y-2"
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="e.g. moved the sheep onto Paddock 2 today, grass about 7 inches"
          />
          <div className="flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setText(ex)}
                className="focus-ring rounded-full border border-stone-200 px-3 py-1.5 text-left text-xs text-stone-600 active:bg-emerald-50"
              >
                {ex}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            type="submit"
            size="lg"
            fullWidth
            leftIcon="sparkle"
            loading={parsing}
            disabled={parsing || !text.trim()}
          >
            Log move
          </Button>
        </form>
      )}
    </div>
  );
}
