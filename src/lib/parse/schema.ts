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

// Tolerant of a small/cheap LLM omitting keys or returning a wrong-typed value:
// every field defaults to null when missing and falls back to null on a bad
// type, so a dropped "amount" or "motherVariety" never 400s a valid log.
const nstr = () => z.string().nullable().default(null).catch(null);
const nnum = () => z.number().nullable().default(null).catch(null);

export const llmParseOutputSchema = z.object({
  type: eventTypeEnum.default("observe").catch("observe"),
  commonName: nstr(),
  variety: nstr(),
  plantType: plantTypeEnum.nullable().default(null).catch(null),
  locationName: nstr(),
  occurredAt: nstr(),
  quantity: nnum(),
  unit: nstr(),
  amount: nnum(),
  notes: nstr(),
  motherVariety: nstr(),
  fatherVariety: nstr(),
  clarifyingQuestion: nstr(),
  suggestNewPlanting: z.boolean().default(false).catch(false),
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
