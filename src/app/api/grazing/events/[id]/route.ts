import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { grazingEvents } from "@/db/schema";
import { handleZodError, jsonError, requireUser } from "@/lib/api";
import { getOwnedGrazingEvent } from "@/lib/ownership";
import { serializeGrazingEvent } from "@/lib/serializers";
import { updateGrazingEventSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedGrazingEvent(id, user.id);
  if (!existing) return jsonError("Grazing record not found", 404);

  try {
    const body = await request.json();
    const data = updateGrazingEventSchema.parse(body);

    await db
      .update(grazingEvents)
      .set({
        ...(data.movedInAt !== undefined
          ? { movedInAt: new Date(data.movedInAt) }
          : {}),
        ...(data.movedOutAt !== undefined
          ? { movedOutAt: data.movedOutAt ? new Date(data.movedOutAt) : null }
          : {}),
        ...(data.heightInIn !== undefined
          ? { heightInIn: data.heightInIn ?? null }
          : {}),
        ...(data.heightOutIn !== undefined
          ? { heightOutIn: data.heightOutIn ?? null }
          : {}),
        ...(data.forageSpecies !== undefined
          ? { forageSpecies: data.forageSpecies ?? null }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      })
      .where(eq(grazingEvents.id, id));

    const row = await getOwnedGrazingEvent(id, user.id);
    return NextResponse.json({ grazingEvent: serializeGrazingEvent(row!) });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update grazing record", 500);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedGrazingEvent(id, user.id);
  if (!existing) return jsonError("Grazing record not found", 404);

  await db.delete(grazingEvents).where(eq(grazingEvents.id, id));
  return NextResponse.json({ ok: true });
}
