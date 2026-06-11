export type LocationType =
  | "farm"
  | "field"
  | "zone"
  | "hoophouse"
  | "bed"
  | "row"
  | "alley"
  | "fence"
  | "paddock";
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
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Polygon"; coordinates: [number, number][][] };

export type LocationRecord = {
  id: string;
  name: string;
  type: LocationType;
  parentId: string | null;
  geometry: GeoJSONGeometry;
  zone: string | null;
  createdAt: string;
};

export type PlantingRecord = {
  id: string;
  locationId: string;
  varietyId: string | null;
  plantType: PlantType;
  commonName: string;
  variety: string | null;
  source: string | null;
  status: PlantingStatus;
  seasonId: string | null;
  parentPlantingId: string | null;
  createdAt: string;
};

export type VarietyRecord = {
  id: string;
  name: string;
  plantType: PlantType;
  lineageParentIds: string[] | null;
  notes: string | null;
  createdAt: string;
};

export type CrossRecord = {
  id: string;
  motherPlantingId: string;
  fatherPlantingId: string;
  occurredAt: string;
  resultLineId: string | null;
  notes: string | null;
  createdAt: string;
};

export type SeasonRecord = {
  id: string;
  locationId: string | null;
  label: string;
  startsAt: string;
  endsAt: string;
  status: SeasonStatus;
  reviewSummary: string | null;
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

export type HerdSpecies =
  | "cattle"
  | "sheep"
  | "goat"
  | "horse"
  | "poultry"
  | "other";

export type HerdRecord = {
  id: string;
  name: string;
  species: HerdSpecies;
  headCount: number;
  avgWeightLb: number;
  dmIntakePct: number | null;
  notes: string | null;
  createdAt: string;
};

export type PaddockRecord = {
  id: string;
  locationId: string;
  primaryForage: string | null;
  acres: number | null;
  restTargetDays: number | null;
  startHeightIn: number | null;
  stopHeightIn: number | null;
  notes: string | null;
  createdAt: string;
};

export type GrazingEventRecord = {
  id: string;
  herdId: string;
  locationId: string;
  movedInAt: string;
  movedOutAt: string | null;
  heightInIn: number | null;
  heightOutIn: number | null;
  forageSpecies: string | null;
  notes: string | null;
  createdAt: string;
};

// Rotation state for a single paddock, derived (not stored).
export type PaddockStatus = "grazing" | "ready" | "resting" | "idle";
