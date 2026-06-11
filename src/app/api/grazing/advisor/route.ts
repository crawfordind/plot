import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { grazingEvents, herds, locations, paddocks } from "@/db/schema";
import { requireUser } from "@/lib/api";
import { buildGrazingSnapshot } from "@/lib/grazing/status";
import {
  serializeGrazingEvent,
  serializeHerd,
  serializeLocation,
  serializePaddock,
} from "@/lib/serializers";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const [herdRows, paddockRows, locationRows, eventRows] = await Promise.all([
    db.query.herds.findMany({ where: eq(herds.userId, user.id) }),
    db.query.paddocks.findMany({ where: eq(paddocks.userId, user.id) }),
    db.query.locations.findMany({ where: eq(locations.userId, user.id) }),
    db.query.grazingEvents.findMany({
      where: eq(grazingEvents.userId, user.id),
    }),
  ]);

  const snapshot = buildGrazingSnapshot(
    herdRows.map(serializeHerd),
    paddockRows.map(serializePaddock),
    locationRows.map(serializeLocation),
    eventRows.map(serializeGrazingEvent),
  );

  return NextResponse.json({ grazing: snapshot });
}
