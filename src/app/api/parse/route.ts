import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { locations, plantings } from "@/db/schema";
import { jsonError, requireOrg } from "@/lib/api";
import { chatCompletion } from "@/lib/openrouter";
import { buildParsePrompt } from "@/lib/parse/prompt";
import { resolveParse } from "@/lib/parse/resolve";
import { getPostParseTip } from "@/lib/coach/tips";
import { normalizeLlmResponse } from "@/lib/parse/normalize";
import { parseRequestSchema } from "@/lib/parse/schema";
import { serializeLocation, serializePlanting } from "@/lib/serializers";

export async function POST(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = parseRequestSchema.parse(body);

    const [locationRows, plantingRows] = await Promise.all([
      db.query.locations.findMany({
        where: eq(locations.orgId, org.id),
      }),
      db.query.plantings.findMany({
        where: eq(plantings.orgId, org.id),
      }),
    ]);

    const locationRecords = locationRows.map(serializeLocation);
    const plantingRecords = plantingRows.map(serializePlanting);
    const today = new Date().toISOString().slice(0, 10);

    const systemPrompt = buildParsePrompt({
      locations: locationRecords,
      plantings: plantingRecords,
      selectedLocationId: data.selectedLocationId,
      today,
      clarification: data.clarification,
    });

    const rawJson = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: data.rawText },
    ]);

    const normalized = normalizeLlmResponse(JSON.parse(rawJson));
    const resolveOptions = { selectedLocationId: data.selectedLocationId };

    const resolved = resolveParse(
      normalized.primary,
      locationRecords,
      plantingRecords,
      resolveOptions,
    );
    const additionalResolved = normalized.additional.map((item) =>
      resolveParse(item, locationRecords, plantingRecords, resolveOptions),
    );
    const hasSplit = additionalResolved.length > 0;

    return NextResponse.json({
      rawText: data.rawText,
      llmOutput: normalized.primary,
      resolved,
      additionalResolved,
      coachTip: getPostParseTip(resolved, hasSplit),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      // The request body itself failing is rare; a ZodError here almost always
      // means the model's output didn't fit. Give a friendly retry, not raw Zod.
      return jsonError(
        "I couldn't read that one clearly. Try naming the action, plant, and place — e.g. \"watered tomatoes in Bed 2 today\".",
        422,
      );
    }
    if (error instanceof SyntaxError) {
      return jsonError("The AI gave an unexpected response. Please try again.", 502);
    }
    if (error instanceof Error) {
      if (error.message.includes("OPENROUTER_API_KEY")) {
        return jsonError("AI parsing is not configured. Add OPENROUTER_API_KEY.", 503);
      }
      return jsonError(error.message, 502);
    }
    return jsonError("The AI couldn't process that. Please try again.", 500);
  }
}
