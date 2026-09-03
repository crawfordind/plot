import type { LocationType } from "@/lib/locations/catalog";
import type { CropFamily } from "@/lib/crops/family";

export type { LocationType, CropFamily };
export type PlantType = "crop" | "flower" | "tree" | "breeding_line";
export type PlantingStatus = "active" | "harvested" | "archived";
// Derived (not stored) maturity state for a planting, mirroring PaddockStatus.
export type CropStatus = "growing" | "ready" | "harvesting" | "done";
export type DtmFrom = "sow" | "transplant";
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
  | "visit"
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

// A personal access token for read-only external API access (e.g. QGIS). The raw
// token is only ever returned once at creation; this is the safe-to-list shape.
export type ApiTokenRecord = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
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
  sownAt: string | null;
  transplantedAt: string | null;
  expectedHarvestAt: string | null;
  closedAt: string | null;
  daysToMaturity: number | null;
  cropFamily: CropFamily | null;
  createdAt: string;
};

export type VarietyRecord = {
  id: string;
  name: string;
  plantType: PlantType;
  lineageParentIds: string[] | null;
  daysToMaturity: number | null;
  dtmFrom: DtmFrom | null;
  cropFamily: CropFamily | null;
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

export type Survival = "alive" | "dead" | "missing";
export type HeightRef = "inside" | "at_tube_top" | "above_tube";
export type DamageKind = "browse" | "rodent" | "insect" | "tube_down";
export type TubeCondition = "intact" | "loose" | "down" | "removed";

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
  // Visit fields — populated when type === "visit", null otherwise.
  // heightCm is centimetres on the wire as well as on disk; convert for display
  // with lib/tags/units.ts using the org's heightUnit.
  survival: Survival | null;
  heightCm: number | null;
  caliperMm: number | null;
  heightRef: HeightRef | null;
  damage: DamageKind[];
  tubeCondition: TubeCondition | null;
  replacedById: string | null;
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

// ─── Tags ───────────────────────────────────────────────────────────────────

// Display preference only — heights are stored and transmitted in centimetres.
// See lib/tags/units.ts.
export type HeightUnit = "cm" | "in";

export type TagKind = "nfc" | "qr" | "both";
export type TagScope = "tube" | "row" | "block";
export type TagStatus = "active" | "lost" | "retired" | "unbound";
export type TagReadVia = "nfc" | "qr" | "manual";

export type TagRecord = {
  id: string;
  tagCode: string;
  chipUid: string | null;
  kind: TagKind;
  scope: TagScope;
  locationId: string;
  plantingId: string | null;
  status: TagStatus;
  aliasOfTagId: string | null;
  writtenLat: number | null;
  writtenLng: number | null;
  writtenAt: string;
  lastReadAt: string | null;
  createdAt: string;
};

export type TagReadRecord = {
  id: string;
  tagId: string;
  readVia: TagReadVia;
  lat: number | null;
  lng: number | null;
  eventId: string | null;
  readAt: string;
};

// One point on the growth curve shown on the scan landing.
export type GrowthPoint = {
  occurredAt: string;
  heightCm: number;
};

// Everything the scan landing needs, resolved in one round trip so a tap in a
// field with one bar still paints a complete screen.
export type TagResolution = {
  tag: TagRecord;
  location: LocationRecord;
  planting: PlantingRecord | null;
  // Most recent first.
  recentVisits: EventRecord[];
  growth: GrowthPoint[];
  // Display unit for this farm; heights in this payload are still centimetres.
  heightUnit: HeightUnit;
};

// What a 404 hands back instead of a dead end: the records near enough to be
// what the crew is standing at, so a re-tag lands on the existing history.
export type NearbyCandidate = {
  location: LocationRecord;
  meters: number | null;
  // The tag already on this record, when it has one that stopped reading.
  lastTagStatus: TagStatus | null;
  lastReadAt: string | null;
};

// The Tag health screen's payload.
export type TagHealthSummary = {
  total: number;
  readingFine: number;
  silent: number;
  lost: number;
  silentAfterDays: number;
  silentTags: {
    tag: TagRecord;
    locationName: string;
  }[];
};
