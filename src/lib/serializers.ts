import type {
  GeoJSONGeometry,
  PhotoInsightRecord,
  PhotoObservations,
} from "@/lib/types";
import type {
  attachments,
  crosses,
  events,
  grazingEvents,
  herds,
  locations,
  paddocks,
  photoInsights,
  plantings,
  seasons,
  varieties,
} from "@/db/schema";

type LocationRow = typeof locations.$inferSelect;
type AttachmentRow = typeof attachments.$inferSelect;
type PhotoInsightRow = typeof photoInsights.$inferSelect;
type PlantingRow = typeof plantings.$inferSelect;
type EventRow = typeof events.$inferSelect;
type HerdRow = typeof herds.$inferSelect;
type PaddockRow = typeof paddocks.$inferSelect;
type GrazingEventRow = typeof grazingEvents.$inferSelect;
type VarietyRow = typeof varieties.$inferSelect;
type CrossRow = typeof crosses.$inferSelect;
type SeasonRow = typeof seasons.$inferSelect;

export function serializeLocation(row: LocationRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    parentId: row.parentId,
    geometry: JSON.parse(row.geometry) as GeoJSONGeometry,
    zone: row.zone,
    createdAt: row.createdAt.toISOString(),
  };
}

const EMPTY_OBSERVATIONS: PhotoObservations = {
  subject: null,
  growthStage: null,
  healthAssessment: null,
  soilCondition: null,
  pestsOrDisease: null,
  weeds: null,
  gridNotes: null,
  recommendations: [],
  concerns: [],
};

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializePhotoInsight(row: PhotoInsightRow): PhotoInsightRecord {
  return {
    id: row.id,
    attachmentId: row.attachmentId,
    model: row.model,
    promptVersion: row.promptVersion,
    summary: row.summary,
    subjectType: row.subjectType,
    tags: parseJson<string[]>(row.tags, []),
    observations: {
      ...EMPTY_OBSERVATIONS,
      ...parseJson<Partial<PhotoObservations>>(row.observations, {}),
    },
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeAttachment(
  row: AttachmentRow,
  insight?: PhotoInsightRow | null,
) {
  return {
    id: row.id,
    locationId: row.locationId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    kind: row.kind,
    caption: row.caption,
    source: row.source,
    lat: row.lat,
    lng: row.lng,
    heading: row.heading,
    capturedAt: row.capturedAt ? row.capturedAt.toISOString() : null,
    placeLabel: row.placeLabel,
    userContext: row.userContext,
    analysisStatus: row.analysisStatus,
    createdAt: row.createdAt.toISOString(),
    url: `/api/attachments/${row.id}/file`,
    insight: insight ? serializePhotoInsight(insight) : null,
  };
}

export function serializePlanting(row: PlantingRow) {
  return {
    id: row.id,
    locationId: row.locationId,
    varietyId: row.varietyId,
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

export function serializeVariety(row: VarietyRow) {
  let lineageParentIds: string[] | null = null;
  if (row.lineageParentIds) {
    try {
      const parsed = JSON.parse(row.lineageParentIds);
      if (Array.isArray(parsed)) lineageParentIds = parsed.map(String);
    } catch {
      lineageParentIds = null;
    }
  }
  return {
    id: row.id,
    name: row.name,
    plantType: row.plantType,
    lineageParentIds,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeCross(row: CrossRow) {
  return {
    id: row.id,
    motherPlantingId: row.motherPlantingId,
    fatherPlantingId: row.fatherPlantingId,
    occurredAt: row.occurredAt.toISOString(),
    resultLineId: row.resultLineId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeSeason(row: SeasonRow) {
  return {
    id: row.id,
    locationId: row.locationId,
    label: row.label,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
    reviewSummary: row.reviewSummary,
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

export function serializeHerd(row: HerdRow) {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    headCount: row.headCount,
    avgWeightLb: row.avgWeightLb,
    dmIntakePct: row.dmIntakePct,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializePaddock(row: PaddockRow) {
  return {
    id: row.id,
    locationId: row.locationId,
    primaryForage: row.primaryForage,
    acres: row.acres,
    restTargetDays: row.restTargetDays,
    startHeightIn: row.startHeightIn,
    stopHeightIn: row.stopHeightIn,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializeGrazingEvent(row: GrazingEventRow) {
  return {
    id: row.id,
    herdId: row.herdId,
    locationId: row.locationId,
    movedInAt: row.movedInAt.toISOString(),
    movedOutAt: row.movedOutAt ? row.movedOutAt.toISOString() : null,
    heightInIn: row.heightInIn,
    heightOutIn: row.heightOutIn,
    forageSpecies: row.forageSpecies,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}
