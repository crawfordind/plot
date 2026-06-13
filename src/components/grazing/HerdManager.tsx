"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import type { HerdRecord, HerdSpecies } from "@/lib/types";

type HerdManagerProps = {
  herds: HerdRecord[];
  onChanged: () => void;
};

const SPECIES: { id: HerdSpecies; label: string; defaultWeight: number }[] = [
  { id: "sheep", label: "Sheep", defaultWeight: 120 },
  { id: "goat", label: "Goat", defaultWeight: 100 },
  { id: "cattle", label: "Cattle", defaultWeight: 1100 },
  { id: "horse", label: "Horse", defaultWeight: 1100 },
  { id: "poultry", label: "Poultry", defaultWeight: 5 },
  { id: "other", label: "Other", defaultWeight: 1000 },
];

const speciesLabel = (s: HerdSpecies) =>
  SPECIES.find((x) => x.id === s)?.label ?? s;

export default function HerdManager({ herds, onChanged }: HerdManagerProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {herds.length === 0 && !adding && (
        <EmptyState
          icon="herd"
          title="No herds yet"
          description="Add a livestock group — its species, head count, and average weight drive the forage balance and rotation."
          actionLabel="Add your first herd"
          actionIcon="plus"
          onAction={() => setAdding(true)}
        />
      )}

      <ul className="space-y-1.5">
        {herds.map((h) => (
          <li key={h.id}>
            {editingId === h.id ? (
              <HerdForm
                herd={h}
                onDone={() => {
                  setEditingId(null);
                  onChanged();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-stone-100 bg-white px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-800">{h.name}</p>
                  <p className="truncate text-xs text-stone-500">
                    {h.headCount} head · {speciesLabel(h.species)} · {h.avgWeightLb} lb avg
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon="pencil"
                  onClick={() => setEditingId(h.id)}
                  className="shrink-0 text-emerald-700"
                >
                  Edit
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <HerdForm
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        herds.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="focus-ring touch-target flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-emerald-300 py-3 text-sm font-semibold text-emerald-700 active:bg-emerald-50"
          >
            + Add herd
          </button>
        )
      )}
    </div>
  );
}

function HerdForm({
  herd,
  onDone,
  onCancel,
}: {
  herd?: HerdRecord;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(herd?.name ?? "");
  const [species, setSpecies] = useState<HerdSpecies>(herd?.species ?? "sheep");
  const [headCount, setHeadCount] = useState(
    herd?.headCount != null ? String(herd.headCount) : "",
  );
  const [avgWeightLb, setAvgWeightLb] = useState(
    herd?.avgWeightLb != null ? String(herd.avgWeightLb) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When a herd has grazing history, the first Delete press asks for an explicit
  // confirmation showing how many NRCS 528 records would be destroyed.
  const [confirmCount, setConfirmCount] = useState<number | null>(null);

  function pickSpecies(s: HerdSpecies) {
    setSpecies(s);
    if (!avgWeightLb) {
      const def = SPECIES.find((x) => x.id === s)?.defaultWeight;
      if (def) setAvgWeightLb(String(def));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim() || speciesLabel(species),
        species,
        headCount: Number(headCount),
        avgWeightLb: Number(avgWeightLb),
      };
      const url = herd ? `/api/grazing/herds/${herd.id}` : "/api/grazing/herds";
      const response = await fetch(url, {
        method: herd ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to save herd");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save herd");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(force = false) {
    if (!herd) return;
    setSaving(true);
    setError(null);
    try {
      const url = `/api/grazing/herds/${herd.id}${force ? "?force=1" : ""}`;
      const response = await fetch(url, { method: "DELETE" });
      if (response.status === 409) {
        // Herd has grazing history — surface the count and require a second tap.
        const data = await response.json();
        setConfirmCount(data.grazingEventCount ?? 0);
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete herd");
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete herd");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3"
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Herd name (e.g. Ewe flock)"
      />

      <div className="flex flex-wrap gap-1.5">
        {SPECIES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => pickSpecies(s.id)}
            className={`focus-ring rounded-full px-3 py-1.5 text-xs font-semibold ${
              species === s.id
                ? "bg-emerald-600 text-white"
                : "border border-stone-200 bg-white text-stone-600"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Head count">
          <Input
            type="number"
            inputMode="numeric"
            value={headCount}
            onChange={(e) => setHeadCount(e.target.value)}
            placeholder="e.g. 60"
          />
        </Field>
        <Field label="Avg weight (lb)">
          <Input
            type="number"
            inputMode="decimal"
            value={avgWeightLb}
            onChange={(e) => setAvgWeightLb(e.target.value)}
            placeholder="e.g. 120"
          />
        </Field>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {confirmCount !== null ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">
            Deleting this herd also removes{" "}
            <strong>
              {confirmCount} grazing record{confirmCount === 1 ? "" : "s"}
            </strong>{" "}
            — its NRCS 528 history. This can&apos;t be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setConfirmCount(null)}
            >
              Keep herd
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              leftIcon="trash"
              loading={saving}
              onClick={() => handleDelete(true)}
            >
              Delete anyway
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          {herd && (
            <Button
              variant="danger"
              leftIcon="trash"
              loading={saving}
              onClick={() => handleDelete(false)}
            >
              Delete
            </Button>
          )}
          <Button
            type="submit"
            className="flex-[2]"
            loading={saving}
            disabled={saving || !headCount || !avgWeightLb}
          >
            {herd ? "Save" : "Add herd"}
          </Button>
        </div>
      )}
    </form>
  );
}
