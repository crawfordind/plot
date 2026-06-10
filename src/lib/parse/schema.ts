import { z } from "zod";

export const eventTypeEnum = z.enum([
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
]);

export const plantTypeEnum = z.enum(["crop", "flower", "tree", "breeding_line"]);

export const llmParseOutputSchema = z.object({
  type: eventTypeEnum,
  commonName: z.string().nullable(),
  variety: z.string().nullable(),
  plantType: plantTypeEnum.nullable(),
  locationName: z.string().nullable(),
  occurredAt: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  amount: z.number().nullable(),
  notes: z.string().nullable(),
  motherVariety: z.string().nullable(),
  fatherVariety: z.string().nullable(),
  clarifyingQuestion: z.string().nullable(),
  suggestNewPlanting: z.boolean(),
});

export type LlmParseOutput = z.infer<typeof llmParseOutputSchema>;

export const resolvedParseSchema = z.object({
  type: eventTypeEnum,
  commonName: z.string().nullable(),
  variety: z.string().nullable(),
  plantType: plantTypeEnum.nullable(),
  locationId: z.string().nullable(),
  locationName: z.string().nullable(),
  plantingId: z.string().nullable(),
  plantingLabel: z.string().nullable(),
  occurredAt: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  amount: z.number().nullable(),
  notes: z.string().nullable(),
  motherVariety: z.string().nullable(),
  fatherVariety: z.string().nullable(),
  suggestNewPlanting: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
});

export type ResolvedParse = z.infer<typeof resolvedParseSchema>;

export const parseRequestSchema = z.object({
  rawText: z.string().min(1),
  selectedLocationId: z.string().optional(),
  clarification: z.string().optional(),
});

export const confirmLogSchema = z.object({
  rawText: z.string().min(1),
  parsedJson: z.record(z.string(), z.unknown()),
  type: eventTypeEnum,
  locationId: z.string().optional(),
  plantingId: z.string().optional(),
  occurredAt: z.string().datetime(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  amount: z.number().optional(),
  notes: z.string().optional(),
  createPlanting: z
    .object({
      locationId: z.string(),
      plantType: plantTypeEnum,
      commonName: z.string(),
      variety: z.string().optional(),
    })
    .optional(),
});

export const confirmLogBatchSchema = z.object({
  entries: z.array(confirmLogSchema).min(1).max(5),
});
