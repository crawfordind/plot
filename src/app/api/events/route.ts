import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { events } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { findUnownedRef } from "@/lib/ownership";
import { serializeEvent } from "@/lib/serializers";
import { createEventSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const plantingId = searchParams.get("plantingId");

  const rows = await db.query.events.findMany({
    where: (table, { and, eq: eqFn }) => {
      const clauses = [eqFn(table.orgId, org.id)];
      if (locationId) clauses.push(eqFn(table.locationId, locationId));
      if (plantingId) clauses.push(eqFn(table.plantingId, plantingId));
      return and(...clauses);
    },
    orderBy: (table, { desc }) => [desc(table.occurredAt)],
  });

  return NextResponse.json({ events: rows.map(serializeEvent) });
}

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = createEventSchema.parse(body);

    const badRef = await findUnownedRef(org.id, {
      locationId: data.locationId,
      plantingId: data.plantingId,
    });
    if (badRef) return jsonError(`Unknown ${badRef}`, 400);

    const id = nanoid();
    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();

    await db.insert(events).values({
      id,
      orgId: org.id,
      userId: user.id,
      plantingId: data.plantingId ?? null,
      locationId: data.locationId ?? null,
      type: data.type,
      occurredAt,
      quantity: data.quantity ?? null,
      unit: data.unit ?? null,
      amount: data.amount ?? null,
      notes: data.notes ?? null,
      gpsPoint: data.gpsPoint ? JSON.stringify(data.gpsPoint) : null,
    });

    const row = await db.query.events.findFirst({
      where: eq(events.id, id),
    });

    return NextResponse.json({ event: serializeEvent(row!) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
    }
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}
