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

export const createEventSchema = z.object({
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
    "other",
  ]),
  occurredAt: isoDateTime.optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  amount: z.number().optional(),
  notes: z.string().optional(),
  gpsPoint: geoPointSchema.optional(),
});

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
