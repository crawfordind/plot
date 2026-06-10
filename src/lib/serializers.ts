import type { GeoJSONGeometry } from "@/lib/types";
import type { events, locations, plantings } from "@/db/schema";

type LocationRow = typeof locations.$inferSelect;
type PlantingRow = typeof plantings.$inferSelect;
type EventRow = typeof events.$inferSelect;

export function serializeLocation(row: LocationRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    geometry: JSON.parse(row.geometry) as GeoJSONGeometry,
    zone: row.zone,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializePlanting(row: PlantingRow) {
  return {
    id: row.id,
    locationId: row.locationId,
    plantType: row.plantType,
    commonName: row.commonName,
    variety: row.variety,
    source: row.source,
    status: row.status,
    seasonId: row.seasonId,
    parentPlantingId: row.parentPlantingId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeEvent(row: EventRow) {
  return {
    id: row.id,
    plantingId: row.plantingId,
    locationId: row.locationId,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    quantity: row.quantity,
    unit: row.unit,
    amount: row.amount,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}
