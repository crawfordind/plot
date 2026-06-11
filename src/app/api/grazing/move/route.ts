import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { grazingEvents } from "@/db/schema";
import { handleZodError, jsonError, requireUser } from "@/lib/api";
import { getOwnedHerd, getOwnedLocation } from "@/lib/ownership";
import { serializeGrazingEvent } from "@/lib/serializers";
import { grazingMoveSchema } from "@/lib/validators";

// Apply a herd move: close the herd's current open grazing period (recording the
// move-off height) and open a new one on the target paddock.
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  try {
    const body = await request.json();
    const data = grazingMoveSchema.parse(body);

    const herd = await getOwnedHerd(data.herdId, user.id);
    if (!herd) return jsonError("Herd not found", 404);

    // A destination is optional: omitting it records a move OFF pasture.
    let destination = null;
    if (data.toLocationId) {
      destination = await getOwnedLocation(data.toLocationId, user.id);
      if (!destination) return jsonError("Paddock not found", 404);
      if (destination.type !== "paddock") {
        return jsonError("Herds can only be moved onto a paddock", 400);
      }
    }

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();

    // Close any open period for this herd (the paddock it is leaving).
    const open = await db.query.grazingEvents.findFirst({
      where: and(
        eq(grazingEvents.herdId, data.herdId),
        eq(grazingEvents.userId, user.id),
        isNull(grazingEvents.movedOutAt),
      ),
    });

    let closed = null;
    if (open) {
      await db
        .update(grazingEvents)
        .set({
          movedOutAt: occurredAt,
          ...(data.heightOutIn !== undefined
            ? { heightOutIn: data.heightOutIn }
            : {}),
        })
        .where(eq(grazingEvents.id, open.id));
      const closedRow = await db.query.grazingEvents.findFirst({
        where: eq(grazingEvents.id, open.id),
      });
      closed = closedRow ? serializeGrazingEvent(closedRow) : null;
    }

    // Move OFF pasture: just close the open period, open nothing new.
    if (!destination) {
      if (!closed) {
        return jsonError("That herd isn't on a paddock to move off", 400);
      }
      return NextResponse.json({ opened: null, closed }, { status: 200 });
    }

    // Open the new period on the destination paddock.
    const id = nanoid();
    await db.insert(grazingEvents).values({
      id,
      userId: user.id,
      herdId: data.herdId,
      locationId: destination.id,
      movedInAt: occurredAt,
      movedOutAt: null,
      heightInIn: data.heightInIn ?? null,
      heightOutIn: null,
      forageSpecies: data.forageSpecies ?? null,
      notes: data.notes ?? null,
    });

    const opened = await db.query.grazingEvents.findFirst({
      where: eq(grazingEvents.id, id),
    });

    return NextResponse.json(
      { opened: serializeGrazingEvent(opened!), closed },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to record move", 500);
  }
}
