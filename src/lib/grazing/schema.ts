import { z } from "zod";
import { herdSpeciesEnum } from "@/lib/validators";

// What the cheap LLM returns when parsing a plain-language herd move, e.g.
// "moved the sheep onto paddock 3 today, grass about 8 inches".
export const moveParseSchema = z.object({
  // move = off current + onto target; move_in = just onto; move_out = just off.
  action: z.enum(["move", "move_in", "move_out"]).nullable().optional(),
  herdName: z.string().nullable().optional(),
  paddockName: z.string().nullable().optional(),
  occurredAt: z.string().nullable().optional(),
  heightInIn: z.number().nullable().optional(),
  heightOutIn: z.number().nullable().optional(),
  forageSpecies: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  clarifyingQuestion: z.string().nullable().optional(),
});

export type MoveParse = z.infer<typeof moveParseSchema>;

// What the LLM returns when parsing a planning description, e.g.
// "6 acres of cool-season grass, 60 sheep at 60 lb, 30-day rest, 2 days a paddock".
export const planParseSchema = z.object({
  acres: z.number().nullable().optional(),
  forage: z.string().nullable().optional(),
  forageLbPerAcre: z.number().nullable().optional(),
  harvestEfficiency: z.number().nullable().optional(),
  animals: z
    .array(
      z.object({
        species: herdSpeciesEnum,
        head: z.number().int().min(1),
        weightLb: z.number().positive(),
      }),
    )
    .nullable()
    .optional(),
  restDays: z.number().nullable().optional(),
  grazeDaysPerPaddock: z.number().nullable().optional(),
  clarifyingQuestion: z.string().nullable().optional(),
});

export type PlanParse = z.infer<typeof planParseSchema>;
