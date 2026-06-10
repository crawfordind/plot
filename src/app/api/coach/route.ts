import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, locations, plantings } from "@/db/schema";
import { requireUser } from "@/lib/api";
import { buildCoachSnapshot } from "@/lib/coach/insights";
import { serializeEvent, serializeLocation, serializePlanting } from "@/lib/serializers";

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { searchParams } = new URL(request.url);
  const selectedLocationId = searchParams.get("locationId") ?? undefined;

  const [locationRows, plantingRows, eventRows] = await Promise.all([
    db.query.locations.findMany({ where: eq(locations.userId, user.id) }),
    db.query.plantings.findMany({ where: eq(plantings.userId, user.id) }),
    db.query.events.findMany({
      where: eq(events.userId, user.id),
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
