export type LocationType = "farm" | "bed" | "zone" | "hoophouse" | "alley";
export type PlantType = "crop" | "flower" | "tree" | "breeding_line";
export type PlantingStatus = "active" | "harvested" | "archived";
export type EventType =
  | "sow"
  | "transplant"
  | "water"
  | "amend"
  | "observe"
  | "harvest"
  | "cross"
  | "seed_save"
  | "sale"
  | "cost"
  | "other";
export type SeasonStatus = "active" | "closed";

export type GeoJSONGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "Polygon"; coordinates: [number, number][][] };

export type LocationRecord = {
  id: string;
  name: string;
  type: LocationType;
  geometry: GeoJSONGeometry;
  zone: string | null;
  createdAt: string;
};

export type PlantingRecord = {
  id: string;
  locationId: string;
  plantType: PlantType;
  commonName: string;
  variety: string | null;
  source: string | null;
  status: PlantingStatus;
  seasonId: string | null;
  parentPlantingId: string | null;
  createdAt: string;
};

export type EventRecord = {
  id: string;
  plantingId: string | null;
  locationId: string | null;
  type: EventType;
  occurredAt: string;
  quantity: number | null;
  unit: string | null;
  amount: number | null;
  notes: string | null;
  createdAt: string;
};
