import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { chatCompletion } from "@/lib/openrouter";
import { computeBalance } from "@/lib/grazing/balance";
import { buildGrazingPlanPrompt } from "@/lib/grazing/prompt";
import { planParseSchema } from "@/lib/grazing/schema";
import { grazingPlanRequestSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = grazingPlanRequestSchema.parse(body);

    const today = new Date().toISOString().slice(0, 10);
    const rawJson = await chatCompletion([
      { role: "system", content: buildGrazingPlanPrompt(today) },
      { role: "user", content: data.rawText },
    ]);

    const parsed = planParseSchema.parse(JSON.parse(rawJson));

    const animals = parsed.animals ?? [];
    if (!parsed.acres || animals.length === 0) {
      return NextResponse.json({
        rawText: data.rawText,
        parsed,
        clarifyingQuestion:
          parsed.clarifyingQuestion ??
          "How many acres do you have, and what livestock (species, head count, average weight)?",
      });
    }

    const grazeDays = parsed.grazeDaysPerPaddock ?? 2;
    const balance = computeBalance({
      animals: animals.map((a) => ({
        species: a.species,
        head: a.head,
        weightLb: a.weightLb,
      })),
      acres: parsed.acres,
      grazeDaysPerPaddock: grazeDays,
      forageLbPerAcre: parsed.forageLbPerAcre ?? undefined,
      harvestEfficiency: parsed.harvestEfficiency ?? undefined,
    });

    return NextResponse.json({
      rawText: data.rawText,
      parsed,
      restTargetDays: parsed.restDays ?? null,
      forage: parsed.forage ?? null,
      balance,
    });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    if (error instanceof SyntaxError) {
      return jsonError("Failed to parse model response", 502);
    }
    if (error instanceof Error) {
      if (error.message.includes("OPENROUTER_API_KEY")) {
        return jsonError("AI parsing is not configured. Add OPENROUTER_API_KEY.", 503);
      }
      return jsonError(error.message, 502);
    }
    return jsonError("Plan failed", 500);
  }
}
