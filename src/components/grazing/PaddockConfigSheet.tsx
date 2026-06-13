"use client";

import { useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { Field, Input } from "@/components/ui/Field";
import type { PaddockRecord } from "@/lib/types";

type PaddockConfigSheetProps = {
  locationId: string;
  name: string;
  config: PaddockRecord | null;
  onSaved: () => void;
  onClose: () => void;
};

function numOrUndef(v: string): number | undefined {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? undefined : n;
}

export default function PaddockConfigSheet({
  locationId,
  name,
  config,
  onSaved,
  onClose,
}: PaddockConfigSheetProps) {
  const [primaryForage, setPrimaryForage] = useState(config?.primaryForage ?? "");
  const [restTargetDays, setRestTargetDays] = useState(
    config?.restTargetDays != null ? String(config.restTargetDays) : "30",
  );
  const [startHeightIn, setStartHeightIn] = useState(
    config?.startHeightIn != null ? String(config.startHeightIn) : "",
  );
  const [stopHeightIn, setStopHeightIn] = useState(
    config?.stopHeightIn != null ? String(config.stopHeightIn) : "3",
  );
  const [acres, setAcres] = useState(config?.acres != null ? String(config.acres) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/grazing/paddocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          primaryForage: primaryForage.trim() || undefined,
          restTargetDays: numOrUndef(restTargetDays),
          startHeightIn: numOrUndef(startHeightIn),
          stopHeightIn: numOrUndef(stopHeightIn),
          acres: numOrUndef(acres),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to save");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title={name} subtitle="Paddock grazing settings">
      <div className="space-y-3">
        <Field label="Primary forage">
          <Input
            value={primaryForage}
            onChange={(e) => setPrimaryForage(e.target.value)}
            placeholder="e.g. Mixed Cool-Season Grasses"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Rest target (days)"
            help="Days a paddock should recover before it's grazed again (NRCS 528). Cool-season pasture is typically 21–45 days."
          >
            <Input
              type="number"
              inputMode="numeric"
              value={restTargetDays}
              onChange={(e) => setRestTargetDays(e.target.value)}
            />
          </Field>
          <Field
            label="Acres"
            help="Override the acreage. Leave blank to compute it from the paddock's shape on the map."
          >
            <Input
              type="number"
              inputMode="decimal"
              value={acres}
              onChange={(e) => setAcres(e.target.value)}
              placeholder="auto from map"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Start height (in)"
            help="Move stock ON when forage reaches this height — usually 6–10 in for cool-season grass."
          >
            <Input
              type="number"
              inputMode="decimal"
              value={startHeightIn}
              onChange={(e) => setStartHeightIn(e.target.value)}
              placeholder="e.g. 8"
            />
          </Field>
          <Field
            label="Stop height (in)"
            help="Move stock OFF at this height to prevent overgrazing — usually 3–4 in."
          >
            <Input
              type="number"
              inputMode="decimal"
              value={stopHeightIn}
              onChange={(e) => setStopHeightIn(e.target.value)}
              placeholder="e.g. 3"
            />
          </Field>
        </div>

        <Callout tone="info" icon="info">
          Move stock on at the start height, off at the stop height (NRCS 528). The rest
          target sets when this paddock turns “ready” to graze again.
        </Callout>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button fullWidth size="lg" loading={saving} onClick={handleSave}>
          Save settings
        </Button>
      </div>
    </BottomSheet>
  );
}
