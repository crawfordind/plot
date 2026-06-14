import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { grazingEvents, herds, locations } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { chatCompletion } from "@/lib/openrouter";
import { buildGrazingMovePrompt } from "@/lib/grazing/prompt";
import { moveParseSchema } from "@/lib/grazing/schema";
import {
  serializeGrazingEvent,
  serializeHerd,
  serializeLocation,
} from "@/lib/serializers";
import type { HerdRecord, LocationRecord } from "@/lib/types";
import { grazingParseRequestSchema } from "@/lib/validators";

function matchByName<T extends { id: string; name: string }>(
  needle: string | null | undefined,
  haystack: T[],
): T | null {
  if (!needle) return null;
  const n = needle.trim().toLowerCase();
  if (!n) return null;
  return (
    haystack.find((h) => h.name.toLowerCase() === n) ??
    haystack.find((h) => h.name.toLowerCase().includes(n)) ??
    haystack.find((h) => n.includes(h.name.toLowerCase())) ??
    null
  );
}

export async function POST(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = grazingParseRequestSchema.parse(body);

    const [herdRows, locationRows, openRows] = await Promise.all([
      db.query.herds.findMany({ where: eq(herds.orgId, org.id) }),
      db.query.locations.findMany({
        where: and(
          eq(locations.orgId, org.id),
          eq(locations.type, "paddock"),
        ),
      }),
      db.query.grazingEvents.findMany({
        where: and(
          eq(grazingEvents.orgId, org.id),
          isNull(grazingEvents.movedOutAt),
        ),
      }),
    ]);

    const herdRecords: HerdRecord[] = herdRows.map(serializeHerd);
    const paddockRecords: LocationRecord[] = locationRows.map(serializeLocation);
    const openEvents = openRows.map(serializeGrazingEvent);

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = buildGrazingMovePrompt({
      herds: herdRecords,
      paddocks: paddockRecords,
      openEvents,
      today,
      clarification: data.clarification,
    });

    const rawJson = await chatCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: data.rawText },
    ]);

    const parsed = moveParseSchema.parse(JSON.parse(rawJson));

    if (parsed.clarifyingQuestion && !data.clarification) {
      return NextResponse.json({
        rawText: data.rawText,
        clarifyingQuestion: parsed.clarifyingQuestion,
      });
    }

    const herd = matchByName(parsed.herdName, herdRecords);
    const paddock = matchByName(parsed.paddockName, paddockRecords);

    return NextResponse.json({
      rawText: data.rawText,
      parsed,
      resolved: {
        action: parsed.action ?? "move",
        herdId: herd?.id ?? null,
        herdName: herd?.name ?? parsed.herdName ?? null,
        toLocationId: paddock?.id ?? null,
        toLocationName: paddock?.name ?? parsed.paddockName ?? null,
        occurredAt: parsed.occurredAt ?? null,
        heightInIn: parsed.heightInIn ?? null,
        heightOutIn: parsed.heightOutIn ?? null,
        forageSpecies: parsed.forageSpecies ?? null,
        notes: parsed.notes ?? null,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    if (error instanceof SyntaxError) {
      return jsonError("The AI gave an unexpected response. Please try again.", 502);
    }
    if (error instanceof Error) {
      if (error.message.includes("OPENROUTER_API_KEY")) {
        return jsonError("AI parsing is not configured. Add OPENROUTER_API_KEY.", 503);
      }
      return jsonError(error.message, 502);
    }
    return jsonError("Move parse failed", 500);
  }
}
