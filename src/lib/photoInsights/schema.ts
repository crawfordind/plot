import { z } from "zod";

// Bump when the prompt or output shape changes meaningfully, so stored insights
// stay interpretable across model/prompt iterations.
export const PROMPT_VERSION = "1";

// What the photo is mainly about — must mirror the photo_insights.subjectType enum
// in src/db/schema.ts. Drives "the right images for the right things".
export const subjectTypeEnum = z.enum([
  "crop",
  "soil",
  "pest_disease",
  "weed",
  "livestock",
  "equipment",
  "infrastructure",
  "water",
  "landscape",
  "other",
]);

export type SubjectType = z.infer<typeof subjectTypeEnum>;

// Tolerant of a small/cheap vision model dropping or mis-typing keys: every field
// falls back to a sane default so a partial read still stores cleanly.
const nstr = () => z.string().nullable().default(null).catch(null);
const sarr = () =>
  z.array(z.string()).default([]).catch([]);

export const observationsSchema = z.object({
  // The crop/animal/object in frame.
  subject: nstr(),
  // Phenological/maturity stage where relevant ("V6 corn", "early flowering").
  growthStage: nstr(),
  // Vigour / health read of the subject.
  healthAssessment: nstr(),
  // Soil surface, structure, moisture, residue, erosion cues.
  soilCondition: nstr(),
  // Pests, disease, or damage symptoms observed.
  pestsOrDisease: nstr(),
  // Weed pressure / species if visible.
  weeds: nstr(),
  // Positional notes that cite the reference grid (e.g. "yellowing in C3–D4").
  gridNotes: nstr(),
  // Actionable next steps for the grower.
  recommendations: sarr(),
  // Things to watch / flags worth a human's attention.
  concerns: sarr(),
});

export type Observations = z.infer<typeof observationsSchema>;

export const photoInsightOutputSchema = z.object({
  summary: z.string().default("").catch(""),
  subjectType: subjectTypeEnum.default("other").catch("other"),
  tags: sarr(),
  confidence: z.number().min(0).max(1).nullable().default(null).catch(null),
  observations: observationsSchema.default(() => observationsSchema.parse({})),
});

export type PhotoInsightOutput = z.infer<typeof photoInsightOutputSchema>;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

// Coerce a raw model JSON blob into a validated insight. Unwraps a stray top-level
// wrapper key if the model nests the payload, then leans on the tolerant schema.
export function normalizePhotoInsight(raw: unknown): PhotoInsightOutput {
  let candidate = asRecord(raw);
  if (
    !("summary" in candidate) &&
    !("subjectType" in candidate) &&
    !("observations" in candidate)
  ) {
    // e.g. { "insight": {...} } or { "analysis": {...} }
    const inner = Object.values(candidate).find(
      (v) => v && typeof v === "object" && !Array.isArray(v),
    );
    if (inner) candidate = asRecord(inner);
  }
  return photoInsightOutputSchema.parse(candidate);
}
