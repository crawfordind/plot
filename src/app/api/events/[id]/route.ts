import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { events } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { findUnownedRef, getOwnedEvent } from "@/lib/ownership";
import { serializeEvent } from "@/lib/serializers";
import { updateEventSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const row = await getOwnedEvent(id, org.id);
  if (!row) return jsonError("Event not found", 404);

  return NextResponse.json({ event: serializeEvent(row) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const existing = await getOwnedEvent(id, org.id);
  if (!existing) return jsonError("Event not found", 404);

  try {
    const body = await request.json();
    const data = updateEventSchema.parse(body);

    const badRef = await findUnownedRef(org.id, {
      locationId: data.locationId,
      plantingId: data.plantingId,
    });
    if (badRef) return jsonError(`Unknown ${badRef}`, 400);

    await db
      .update(events)
      .set({
        ...(data.plantingId !== undefined
          ? { plantingId: data.plantingId ?? null }
          : {}),
        ...(data.locationId !== undefined
          ? { locationId: data.locationId ?? null }
          : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.occurredAt !== undefined
          ? { occurredAt: new Date(data.occurredAt) }
          : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity ?? null } : {}),
        ...(data.unit !== undefined ? { unit: data.unit ?? null } : {}),
        ...(data.amount !== undefined ? { amount: data.amount ?? null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
        ...(data.gpsPoint !== undefined
          ? { gpsPoint: data.gpsPoint ? JSON.stringify(data.gpsPoint) : null }
          : {}),
      })
      .where(eq(events.id, id));

    const row = await getOwnedEvent(id, org.id);
    return NextResponse.json({ event: serializeEvent(row!) });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update event", 500);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const existing = await getOwnedEvent(id, org.id);
  if (!existing) return jsonError("Event not found", 404);

  await db.delete(events).where(eq(events.id, id));
  return NextResponse.json({ ok: true });
}
