"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import DeleteButton from "@/components/ui/DeleteButton";
import Sheet from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import type {
  GrazingEventRecord,
  HerdRecord,
  LocationRecord,
} from "@/lib/types";

type GrazingRecordEditSheetProps = {
  record: GrazingEventRecord;
  herds: HerdRecord[];
  locations: LocationRecord[];
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function fromDateInput(v: string): string | null {
  if (!v) return null;
  // Anchor at local noon so the calendar day is stable across time zones.
  return new Date(`${v}T12:00:00`).toISOString();
}

function numOrNull(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

export default function GrazingRecordEditSheet({
  record,
  herds,
  locations,
  onSaved,
  onDeleted,
  onClose,
}: GrazingRecordEditSheetProps) {
  const toast = useToast();
  const paddocks = locations.filter((l) => l.type === "paddock");
  const herd = herds.find((h) => h.id === record.herdId);
  const [locationId, setLocationId] = useState(record.locationId);
  const [movedInAt, setMovedInAt] = useState(toDateInput(record.movedInAt));
  const [movedOutAt, setMovedOutAt] = useState(toDateInput(record.movedOutAt));
  const [heightInIn, setHeightInIn] = useState(
    record.heightInIn != null ? String(record.heightInIn) : "",
  );
  const [heightOutIn, setHeightOutIn] = useState(
    record.heightOutIn != null ? String(record.heightOutIn) : "",
  );
  const [forageSpecies, setForageSpecies] = useState(record.forageSpecies ?? "");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        locationId,
        heightInIn: numOrNull(heightInIn),
        heightOutIn: numOrNull(heightOutIn),
        forageSpecies: forageSpecies.trim() || null,
        notes: notes.trim() || null,
      };
      const inIso = fromDateInput(movedInAt);
      if (inIso) body.movedInAt = inIso;
      body.movedOutAt = fromDateInput(movedOutAt);

      await apiFetch(`/api/grazing/events/${record.id}`, {
        method: "PATCH",
        body,
      });
      toast.success("Grazing record saved");
      onSaved();
      onClose();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't save this record.");
      setError(message);
      toast.error("Couldn't save record", { description: message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await apiFetch(`/api/grazing/events/${record.id}`, { method: "DELETE" });
      toast.success("Grazing record deleted");
      onDeleted();
      onClose();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't delete this record.");
      toast.error("Couldn't delete record", { description: message });
      // Do NOT re-throw — DeleteButton's onDelete must not propagate errors.
    }
  }

  const field =
    "mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500";
  const label = "block text-xs font-medium text-stone-600";

  return (
    <Sheet
      title="Edit grazing record"
      subtitle={herd ? `${herd.name} · ${herd.headCount} head` : undefined}
      onClose={onClose}
      footer={<DeleteButton onDelete={handleDelete} />}
    >
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className={label}>Paddock</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className={field}
          >
            {paddocks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Date in</label>
            <input
              type="date"
              value={movedInAt}
              onChange={(e) => setMovedInAt(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Date out (blank = still on)</label>
            <input
              type="date"
              value={movedOutAt}
              onChange={(e) => setMovedOutAt(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Height in (in)</label>
            <input
              type="number"
              inputMode="decimal"
              value={heightInIn}
              onChange={(e) => setHeightInIn(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Height out (in)</label>
            <input
              type="number"
              inputMode="decimal"
              value={heightOutIn}
              onChange={(e) => setHeightOutIn(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div>
          <label className={label}>Forage species</label>
          <input
            value={forageSpecies}
            onChange={(e) => setForageSpecies(e.target.value)}
            className={field}
          />
        </div>

        <div>
          <label className={label}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={field}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" fullWidth loading={saving}>
          Save changes
        </Button>
      </form>
    </Sheet>
  );
}
