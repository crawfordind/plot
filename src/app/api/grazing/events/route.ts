import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { grazingEvents } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { getOwnedHerd, getOwnedLocation } from "@/lib/ownership";
import { serializeGrazingEvent } from "@/lib/serializers";
import { createGrazingEventSchema } from "@/lib/validators";

export async function GET() {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const rows = await db.query.grazingEvents.findMany({
    where: eq(grazingEvents.orgId, org.id),
    orderBy: (table, { desc }) => [desc(table.movedInAt)],
  });
  return NextResponse.json({ grazingEvents: rows.map(serializeGrazingEvent) });
}

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = createGrazingEventSchema.parse(body);

    const [herd, location] = await Promise.all([
      getOwnedHerd(data.herdId, org.id),
      getOwnedLocation(data.locationId, org.id),
    ]);
    if (!herd) return jsonError("Herd not found", 404);
    if (!location) return jsonError("Paddock not found", 404);

    const id = nanoid();
    await db.insert(grazingEvents).values({
      id,
      orgId: org.id,
      userId: user.id,
      herdId: data.herdId,
      locationId: data.locationId,
      movedInAt: data.movedInAt ? new Date(data.movedInAt) : new Date(),
      movedOutAt: data.movedOutAt ? new Date(data.movedOutAt) : null,
      heightInIn: data.heightInIn ?? null,
      heightOutIn: data.heightOutIn ?? null,
      forageSpecies: data.forageSpecies ?? null,
      notes: data.notes ?? null,
    });

    const row = await db.query.grazingEvents.findFirst({
      where: eq(grazingEvents.id, id),
    });
    return NextResponse.json(
      { grazingEvent: serializeGrazingEvent(row!) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to create grazing record", 500);
  }
}
