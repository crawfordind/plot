import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { chatCompletion } from "@/lib/openrouter";
import { buildStructurePrompt } from "@/lib/structure/prompt";
import { structureParseRequestSchema, structureSpecSchema } from "@/lib/structure/schema";
import { serializeLocation } from "@/lib/serializers";

export async function POST(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = structureParseRequestSchema.parse(body);

    const locationRows = await db.query.locations.findMany({
      where: eq(locations.orgId, org.id),
    });
    const locationRecords = locationRows.map(serializeLocation);

    const systemPrompt = buildStructurePrompt({ locations: locationRecords });
    const rawJson = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: data.rawText },
    ]);

    const spec = structureSpecSchema.parse(JSON.parse(rawJson));

    return NextResponse.json({ rawText: data.rawText, spec });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
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
    return jsonError("Structure parse failed", 500);
  }
}
