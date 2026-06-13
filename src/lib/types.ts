import type { LocationType } from "@/lib/locations/catalog";

export type { LocationType };
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

export type OrgRole = "owner" | "admin" | "member";

export type OrganizationRecord = {
  id: string;
  name: string;
  role: OrgRole;
};

export type MemberRecord = {
  userId: string;
  email: string;
  name: string | null;
  role: OrgRole;
  isYou: boolean;
};

export type PendingInviteRecord = {
  id: string;
  email: string;
  role: OrgRole;
  createdAt: string;
};

export type AttachmentKind = "image" | "video" | "document" | "other";

export type AttachmentSource = "asset_camera" | "live_camera" | "upload";

export type AttachmentAnalysisStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed";

export type PhotoSubjectType =
  | "crop"
  | "soil"
  | "pest_disease"
  | "weed"
  | "livestock"
  | "equipment"
  | "infrastructure"
  | "water"
  | "landscape"
  | "other";

export type PhotoObservations = {
  subject: string | null;
  growthStage: string | null;
  healthAssessment: string | null;
  soilCondition: string | null;
  pestsOrDisease: string | null;
  weeds: string | null;
  gridNotes: string | null;
  recommendations: string[];
  concerns: string[];
};

export type PhotoInsightRecord = {
  id: string;
  attachmentId: string;
  model: string;
  promptVersion: string;
  summary: string;
  subjectType: PhotoSubjectType;
  tags: string[];
  observations: PhotoObservations;
  confidence: number | null;
  createdAt: string;
};

export type AttachmentRecord = {
  id: string;
  locationId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  caption: string | null;
  source: AttachmentSource;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  capturedAt: string | null;
  placeLabel: string | null;
  userContext: string | null;
  analysisStatus: AttachmentAnalysisStatus;
  createdAt: string;
  // Convenience URL the client uses to load/download the file.
  url: string;
  // The AI read of this photo, when one exists.
  insight: PhotoInsightRecord | null;
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
