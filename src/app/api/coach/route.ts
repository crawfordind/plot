import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, locations, plantings } from "@/db/schema";
import { requireOrg } from "@/lib/api";
import { buildCoachSnapshot } from "@/lib/coach/insights";
import { serializeEvent, serializeLocation, serializePlanting } from "@/lib/serializers";

export async function GET(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { searchParams } = new URL(request.url);
  const selectedLocationId = searchParams.get("locationId") ?? undefined;

  const [locationRows, plantingRows, eventRows] = await Promise.all([
    db.query.locations.findMany({ where: eq(locations.orgId, org.id) }),
    db.query.plantings.findMany({ where: eq(plantings.orgId, org.id) }),
    db.query.events.findMany({
      where: eq(events.orgId, org.id),
      orderBy: (table, { desc }) => [desc(table.occurredAt)],
      limit: 200,
    }),
  ]);

  const snapshot = buildCoachSnapshot(
    locationRows.map(serializeLocation),
    plantingRows.map(serializePlanting),
    eventRows.map(serializeEvent),
    selectedLocationId,
  );

  return NextResponse.json({ coach: snapshot });
}
