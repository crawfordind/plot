import type {
  CropStatus,
  EventRecord,
  LocationRecord,
  PlantingRecord,
} from "@/lib/types";

// Deterministic crop-maturity state, mirroring src/lib/grazing/status.ts. No
// LLM: expectedHarvest = anchor date + days-to-maturity is exact, so the
// "what's ready" view is reliable and free. This is the crops-side counterpart
// to the grazing rotation snapshot.

// How far ahead of its expected harvest a planting starts reading "ready",
// so the farmer gets a week's heads-up rather than a same-day surprise.
export const READY_WINDOW_DAYS = 7;

export type PlantingState = {
  plantingId: string;
  commonName: string;
  variety: string | null;
  locationId: string | null;
  locationName: string | null;
  status: CropStatus;
  sownAt: string | null;
  expectedHarvestAt: string | null;
  // Days until expected harvest (negative = overdue); null when unknown.
  daysToHarvest: number | null;
  lastHarvestAt: string | null;
};

export type CropSnapshot = {
  plantings: PlantingState[];
  // Plantings ready or being harvested now, soonest first — the "ready" shortlist.
  readyNow: PlantingState[];
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date) {
  return Math.round(
    (startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000,
  );
}

export function buildCropSnapshot(
  plantings: PlantingRecord[],
  locations: LocationRecord[],
  events: EventRecord[],
  now: Date = new Date(),
): CropSnapshot {
  const nameById = new Map(locations.map((l) => [l.id, l.name]));
  const windowMs = READY_WINDOW_DAYS * 86_400_000;

  const states: PlantingState[] = plantings
    // Archived plantings are out of the picture entirely.
    .filter((p) => p.status !== "archived")
    .map((p) => {
      const harvests = events
        .filter((e) => e.plantingId === p.id && e.type === "harvest")
        .sort(
          (a, b) =>
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        );
      const lastHarvestAt = harvests[0]?.occurredAt ?? null;
      const expected = p.expectedHarvestAt ? new Date(p.expectedHarvestAt) : null;

      let status: CropStatus;
      if (p.status === "harvested") {
        status = "done";
      } else if (harvests.length > 0) {
        status = "harvesting";
      } else if (expected && expected.getTime() <= now.getTime() + windowMs) {
        status = "ready";
      } else {
        status = "growing";
      }

      return {
        plantingId: p.id,
        commonName: p.commonName,
        variety: p.variety,
        locationId: p.locationId,
        locationName: nameById.get(p.locationId) ?? null,
        status,
        sownAt: p.sownAt,
        expectedHarvestAt: p.expectedHarvestAt,
        daysToHarvest: expected ? daysBetween(expected, now) : null,
        lastHarvestAt,
      };
    })
    .sort((a, b) => {
      // Soonest expected harvest first; unknown dates sink to the bottom.
      const ax = a.expectedHarvestAt ? new Date(a.expectedHarvestAt).getTime() : Infinity;
      const bx = b.expectedHarvestAt ? new Date(b.expectedHarvestAt).getTime() : Infinity;
      return ax - bx;
    });

  const readyNow = states.filter(
    (s) => s.status === "ready" || s.status === "harvesting",
  );

  return { plantings: states, readyNow };
}
