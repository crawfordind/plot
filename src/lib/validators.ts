import { z } from "zod";
import { LOCATION_TYPE_VALUES } from "@/lib/locations/catalog";
import { CROP_FAMILY_VALUES } from "@/lib/crops/family";

export const cropFamilyEnum = z.enum(CROP_FAMILY_VALUES);
export const dtmFromEnum = z.enum(["sow", "transplant"]);

// Accepts what clients and the NL parser actually send: full ISO datetimes
// (with or without timezone) and date-only strings like "2026-06-12".
// z.string().datetime() is stricter than that and rejected real input.
const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date/time");

// A GeoJSON position with real-world bounds. .finite() rejects NaN/±Infinity,
// and the lng/lat ranges reject garbage coordinates that would otherwise be
// stored and later break area math and map rendering.
const lng = z.number().finite().min(-180).max(180);
const lat = z.number().finite().min(-90).max(90);
const position = z.tuple([lng, lat]);

const geoPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: position,
});

const geoLineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(position).min(2),
});

const geoPolygonSchema = z.object({
  type: z.literal("Polygon"),
  // At least one ring, and each ring needs at least 3 vertices to enclose area
  // (degenerate 0–2 point rings have no area and crash shoelace/centroid math).
  coordinates: z.array(z.array(position).min(3)).min(1),
});

export const geometrySchema = z.union([
  geoPointSchema,
  geoLineStringSchema,
  geoPolygonSchema,
]);

export const locationTypeEnum = z.enum(LOCATION_TYPE_VALUES);

export const herdSpeciesEnum = z.enum([
  "cattle",
  "sheep",
  "goat",
  "horse",
  "poultry",
  "other",
]);

export const orgRoleEnum = z.enum(["owner", "admin", "member"]);

export const createOrgSchema = z.object({
  name: z.string().min(1).max(120),
});

export const renameOrgSchema = z.object({
  name: z.string().min(1).max(120),
});

// Workspace settings PATCH. Both fields optional so a caller can change either
// the name or the field-display unit without restating the other.
export const updateOrgSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    heightUnit: z.enum(["cm", "in"]).optional(),
  })
  .refine((v) => v.name !== undefined || v.heightUnit !== undefined, {
    message: "Nothing to update",
  });

export const switchOrgSchema = z.object({
  orgId: z.string().min(1),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  // Can't invite someone as owner; owners are promoted explicitly.
  role: z.enum(["admin", "member"]).default("member"),
});

export const setRoleSchema = z.object({
  role: orgRoleEnum,
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createLocationSchema = z.object({
  name: z.string().min(1),
  type: locationTypeEnum,
  parentId: z.string().optional(),
  geometry: geometrySchema,
  zone: z.string().optional(),
});

// Batch create for the agentic structure builder. Each node carries a client
// tempId and an optional parentTempId referring to an earlier node in the list,
// so a whole farm tree is saved in one request with parent links resolved server-side.
// parentId attaches a node to an EXISTING location instead (e.g. subdividing a
// field into paddocks); ownership is checked server-side.
export const createLocationsBatchSchema = z.object({
  nodes: z
    .array(
      z.object({
        tempId: z.string().min(1),
        parentTempId: z.string().nullable().optional(),
        parentId: z.string().nullable().optional(),
        name: z.string().min(1),
        type: locationTypeEnum,
        geometry: geometrySchema,
        zone: z.string().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const plantTypeEnum = z.enum(["crop", "flower", "tree", "breeding_line"]);

export const createPlantingSchema = z.object({
  locationId: z.string().min(1),
  plantType: plantTypeEnum,
  commonName: z.string().min(1),
  variety: z.string().optional(),
  varietyId: z.string().nullable().optional(),
  source: z.string().optional(),
  seasonId: z.string().nullable().optional(),
  parentPlantingId: z.string().nullable().optional(),
  // Lifecycle dates. expectedHarvestAt is normally derived (sownAt +
  // daysToMaturity) server-side, but may be passed to override.
  sownAt: isoDateTime.optional(),
  transplantedAt: isoDateTime.optional(),
  expectedHarvestAt: isoDateTime.optional(),
  daysToMaturity: z.number().int().positive().max(1000).optional(),
  cropFamily: cropFamilyEnum.nullable().optional(),
});

export const updateLocationSchema = createLocationSchema.partial().extend({
  // Allow re-parenting (e.g. moving an asset to another farm) and clearing it.
  parentId: z.string().nullable().optional(),
});

// Update many location geometries at once. Used when transforming a parent
// (move/rotate/resize) cascades the same transform onto its child locations.
export const batchGeometrySchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().min(1),
        geometry: geometrySchema,
      }),
    )
    .min(1)
    .max(500),
});

export const survivalEnum = z.enum(["alive", "dead", "missing"]);
export const heightRefEnum = z.enum(["inside", "at_tube_top", "above_tube"]);
export const damageKindEnum = z.enum(["browse", "rodent", "insect", "tube_down"]);
export const tubeConditionEnum = z.enum(["intact", "loose", "down", "removed"]);

// Visit measurements, shared by createEvent and the tag visit route. Heights
// arrive in centimetres — the client converts from the farm's display unit
// before sending, so the wire format never depends on a preference.
export const visitFieldsSchema = z.object({
  survival: survivalEnum.optional(),
  heightCm: z.number().finite().min(0).max(3000).optional(),
  caliperMm: z.number().finite().min(0).max(2000).optional(),
  heightRef: heightRefEnum.optional(),
  damage: z.array(damageKindEnum).max(4).optional(),
  tubeCondition: tubeConditionEnum.optional(),
  replacedById: z.string().optional(),
});

export const createEventSchema = z
  .object({
    plantingId: z.string().optional(),
    locationId: z.string().optional(),
    type: z.enum([
      "sow",
      "transplant",
      "water",
      "amend",
      "observe",
      "harvest",
      "cross",
      "seed_save",
      "sale",
      "cost",
      "visit",
      "other",
    ]),
    occurredAt: isoDateTime.optional(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    amount: z.number().optional(),
    notes: z.string().optional(),
    gpsPoint: geoPointSchema.optional(),
  })
  .extend(visitFieldsSchema.shape);

export const updatePlantingSchema = createPlantingSchema
  .extend({
    status: z.enum(["active", "harvested", "archived"]).optional(),
  })
  .partial();

export const updateEventSchema = createEventSchema.partial();

// ---- Grazing ----

export const createHerdSchema = z.object({
  name: z.string().min(1),
  species: herdSpeciesEnum,
  headCount: z.number().int().min(1),
  avgWeightLb: z.number().positive(),
  dmIntakePct: z.number().positive().max(10).optional(),
  notes: z.string().optional(),
});

export const updateHerdSchema = createHerdSchema.partial();

// Grazing config attached to an existing location (the paddock).
export const createPaddockSchema = z.object({
  locationId: z.string().min(1),
  primaryForage: z.string().optional(),
  acres: z.number().positive().optional(),
  restTargetDays: z.number().int().min(1).max(365).optional(),
  startHeightIn: z.number().min(0).max(60).optional(),
  stopHeightIn: z.number().min(0).max(60).optional(),
  notes: z.string().optional(),
});

export const updatePaddockSchema = createPaddockSchema.partial();

export const createGrazingEventSchema = z.object({
  herdId: z.string().min(1),
  locationId: z.string().min(1),
  movedInAt: isoDateTime.optional(),
  movedOutAt: isoDateTime.optional(),
  heightInIn: z.number().min(0).max(60).optional(),
  heightOutIn: z.number().min(0).max(60).optional(),
  forageSpecies: z.string().optional(),
  notes: z.string().optional(),
});

export const updateGrazingEventSchema = createGrazingEventSchema
  .partial()
  // Allow explicitly clearing the out-fields when re-opening a period.
  .extend({
    movedOutAt: isoDateTime.nullable().optional(),
    heightOutIn: z.number().min(0).max(60).nullable().optional(),
  });

// Apply a herd move: close the herd's current open period and open a new one
// on the target paddock. The structured shape the move route + NL parser share.
export const grazingMoveSchema = z.object({
  herdId: z.string().min(1),
  // Omit to record a move OFF pasture (closes the herd's open period).
  toLocationId: z.string().min(1).nullable().optional(),
  occurredAt: isoDateTime.optional(),
  // Height (in) of the paddock being moved ONTO, at move-in.
  heightInIn: z.number().min(0).max(60).optional(),
  // Height (in) of the paddock being moved OFF, at move-out.
  heightOutIn: z.number().min(0).max(60).optional(),
  forageSpecies: z.string().optional(),
  notes: z.string().optional(),
});

export const grazingParseRequestSchema = z.object({
  rawText: z.string().min(1),
  clarification: z.string().optional(),
});

export const grazingPlanRequestSchema = z.object({
  rawText: z.string().min(1),
});

export const subdivideRequestSchema = z.object({
  fieldId: z.string().min(1),
  count: z.number().int().min(2).max(60),
  // Base name for the created paddocks; defaults to "Paddock".
  baseName: z.string().min(1).optional(),
  primaryForage: z.string().optional(),
  restTargetDays: z.number().int().min(1).max(365).optional(),
});

// ---- Varieties / Crosses / Seasons (breeding & seed-saving) ----

export const createVarietySchema = z.object({
  name: z.string().min(1),
  plantType: plantTypeEnum,
  lineageParentIds: z.array(z.string()).optional(),
  daysToMaturity: z.number().int().positive().max(1000).optional(),
  dtmFrom: dtmFromEnum.optional(),
  cropFamily: cropFamilyEnum.nullable().optional(),
  notes: z.string().optional(),
});

export const updateVarietySchema = createVarietySchema.partial();

export const createCrossSchema = z.object({
  motherPlantingId: z.string().min(1),
  fatherPlantingId: z.string().min(1),
  occurredAt: isoDateTime.optional(),
  resultLineId: z.string().optional(),
  notes: z.string().optional(),
});

export const createSeasonSchema = z.object({
  label: z.string().min(1),
  locationId: z.string().nullable().optional(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
});

export const updateSeasonSchema = z.object({
  label: z.string().min(1).optional(),
  locationId: z.string().nullable().optional(),
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.optional(),
  status: z.enum(["active", "closed"]).optional(),
  reviewSummary: z.string().nullable().optional(),
});

// ---- Tags ----

export const tagKindEnum = z.enum(["nfc", "qr", "both"]);
export const tagScopeEnum = z.enum(["tube", "row", "block"]);
export const tagStatusEnum = z.enum(["active", "lost", "retired", "unbound"]);
export const tagReadViaEnum = z.enum(["nfc", "qr", "manual"]);
export const heightUnitEnum = z.enum(["cm", "in"]);

// The device mints the code so writing a tag never waits on the server; the
// unique index is what actually enforces it. Length and alphabet must match
// lib/tags/code.ts.
const tagCode = z
  .string()
  .regex(/^[2-9A-HJ-NP-Z]{8}$/, "Invalid tag code");

// Bind a freshly written tag. `locationId` attaches it to an existing record;
// omitting it creates a new location at `lat`/`lng` named `name`, which is the
// field-encode happy path — identity and GPS fix become the same event.
export const createTagSchema = z
  .object({
    tagCode,
    chipUid: z.string().max(64).optional(),
    kind: tagKindEnum.optional(),
    scope: tagScopeEnum.optional(),
    locationId: z.string().optional(),
    // New-location fields, used when locationId is absent.
    name: z.string().min(1).max(120).optional(),
    parentId: z.string().optional(),
    lat: z.number().finite().min(-90).max(90).optional(),
    lng: z.number().finite().min(-180).max(180).optional(),
    // Optional planting created alongside the tag (species + source stock).
    planting: z
      .object({
        commonName: z.string().min(1).max(120),
        variety: z.string().max(120).optional(),
        source: z.string().max(200).optional(),
        varietyId: z.string().optional(),
      })
      .optional(),
  })
  .refine((v) => v.locationId || (v.name && v.lat != null && v.lng != null), {
    message:
      "Provide either locationId, or name plus lat/lng to create a new location",
  });

// One scan. Sent singly on a live connection, or in a batch when a queue drains.
export const tagReadSchema = z.object({
  readVia: tagReadViaEnum.optional(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
  eventId: z.string().optional(),
  readAt: isoDateTime.optional(),
});

export const tagReadBatchSchema = z.object({
  reads: z.array(tagReadSchema).min(1).max(200),
});

// Point a fresh tag at an existing record. Manager-only, and server-side: a
// re-bind is never a re-write in the field, because the old tag was locked
// read-only the moment it was written.
export const rebindTagSchema = z.object({
  // The new tag's code. It takes over, and the old row is retired behind an
  // alias so the dead tag still resolves here if it ever reads again.
  tagCode,
  chipUid: z.string().max(64).optional(),
  kind: tagKindEnum.optional(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
});

export const updateTagSchema = z.object({
  status: tagStatusEnum.optional(),
  scope: tagScopeEnum.optional(),
  kind: tagKindEnum.optional(),
  plantingId: z.string().nullable().optional(),
});

// A visit logged straight off a scan: the event plus the read that produced it,
// in one request so a crew's tap is one round trip.
export const tagVisitSchema = z
  .object({
    occurredAt: isoDateTime.optional(),
    notes: z.string().max(2000).optional(),
    readVia: tagReadViaEnum.optional(),
    lat: z.number().finite().min(-90).max(90).optional(),
    lng: z.number().finite().min(-180).max(180).optional(),
  })
  .extend(visitFieldsSchema.shape);

export const setHeightUnitSchema = z.object({
  heightUnit: heightUnitEnum,
});
