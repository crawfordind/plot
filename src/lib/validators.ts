import { z } from "zod";

const geoPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

const geoPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))).min(1),
});

export const geometrySchema = z.union([geoPointSchema, geoPolygonSchema]);

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
  type: z.enum(["farm", "bed", "zone", "hoophouse", "alley"]),
  geometry: geometrySchema,
  zone: z.string().optional(),
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
