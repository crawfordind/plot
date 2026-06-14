"use client";

import { useState } from "react";
import SeasonPicker from "@/components/breeding/SeasonPicker";
import VarietyPicker from "@/components/breeding/VarietyPicker";
import LocationField from "@/components/map/LocationField";
import { useMapInteraction } from "@/components/map/MapInteractionContext";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import type {
  LocationRecord,
  PlantType,
  PlantingRecord,
  SeasonRecord,
  VarietyRecord,
} from "@/lib/types";

type PlantingFormProps = {
  locations: LocationRecord[];
  varieties: VarietyRecord[];
  seasons: SeasonRecord[];
  defaultLocationId?: string | null;
  onSaved: () => void;
  onVarietyCreated: () => void;
  onClose: () => void;
};

const plantTypes: { value: PlantType; label: string }[] = [
  { value: "crop", label: "Crop" },
  { value: "flower", label: "Flower" },
  { value: "tree", label: "Tree" },
  { value: "breeding_line", label: "Breeding line" },
];

export default function PlantingForm({
  locations,
  varieties,
  seasons,
  defaultLocationId,
  onSaved,
  onVarietyCreated,
  onClose,
}: PlantingFormProps) {
  const toast = useToast();
  const { picking } = useMapInteraction();
  const [locationId, setLocationId] = useState(
    defaultLocationId ?? locations[0]?.id ?? "",
  );
  const [plantType, setPlantType] = useState<PlantType>("crop");
  const [commonName, setCommonName] = useState("");
  const [variety, setVariety] = useState("");
  const [varietyId, setVarietyId] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await apiFetch<{ planting: PlantingRecord }>("/api/plantings", {
        method: "POST",
        body: {
          locationId,
          plantType,
          commonName,
          variety: variety || undefined,
          varietyId: varietyId ?? undefined,
          seasonId: seasonId ?? undefined,
          source: source || undefined,
        },
      });

      toast.success(`${commonName} planting created`);
      onSaved();
      onClose();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't save this planting.");
      setError(message);
      toast.error("Couldn't create planting", { description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title="New planting" hidden={picking}>
        {locations.length === 0 && (
          <Callout tone="warn" className="mb-3">
            A planting needs a place to live. Map a location first — tap{" "}
            <strong>Pin</strong> to drop one, or <strong>Build</strong> to map your whole
            farm — then add the planting there.
          </Callout>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <LocationField
            locations={locations}
            value={locationId}
            onChange={setLocationId}
            pickTitle="Tap where to place this planting"
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={plantType}
                onChange={(e) => setPlantType(e.target.value as PlantType)}
              >
                {plantTypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Common name">
              <Input
                required
                value={commonName}
                onChange={(e) => setCommonName(e.target.value)}
                placeholder="Zinnia, chestnut…"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Variety">
              <Input
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                placeholder="Zin Master"
              />
            </Field>

            <Field label="Source">
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Eden Brothers"
              />
            </Field>
          </div>

          <VarietyPicker
            varieties={varieties}
            plantType={plantType}
            value={varietyId}
            onChange={(id, vName) => {
              setVarietyId(id);
              if (vName && !variety) setVariety(vName);
            }}
            onCreated={onVarietyCreated}
          />

          <SeasonPicker seasons={seasons} value={seasonId} onChange={setSeasonId} />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={saving}
            disabled={saving || !locationId || !commonName.trim()}
          >
            Create planting
          </Button>
        </form>
    </BottomSheet>
  );
}
