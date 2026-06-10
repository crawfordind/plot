import { z } from "zod";

const geoPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

const geoLineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

const geoPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
});

export const geometrySchema = z.union([
  geoPointSchema,
  geoLineStringSchema,
  geoPolygonSchema,
]);

export const locationTypeEnum = z.enum([
  "farm",
  "field",
  "zone",
  "hoophouse",
  "bed",
  "row",
  "alley",
  "fence",
]);

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
export const createLocationsBatchSchema = z.object({
  nodes: z
    .array(
      z.object({
        tempId: z.string().min(1),
        parentTempId: z.string().nullable().optional(),
        name: z.string().min(1),
        type: locationTypeEnum,
        geometry: geometrySchema,
        zone: z.string().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const createPlantingSchema = z.object({
  locationId: z.string().min(1),
  plantType: z.enum(["crop", "flower", "tree", "breeding_line"]),
  commonName: z.string().min(1),
  variety: z.string().optional(),
  source: z.string().optional(),
  seasonId: z.string().optional(),
  parentPlantingId: z.string().optional(),
});

export const updateLocationSchema = createLocationSchema.partial();

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
  occurredAt: z.string().datetime().optional(),
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
