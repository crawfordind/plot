import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { grazingEvents } from "@/db/schema";
import { handleApiError, handleZodError, jsonError, requireOrg } from "@/lib/api";
import { getOwnedHerd, getOwnedLocation } from "@/lib/ownership";
import { serializeGrazingEvent } from "@/lib/serializers";
import { grazingMoveSchema } from "@/lib/validators";

// Apply a herd move: close the herd's current open grazing period (recording the
// move-off height) and open a new one on the target paddock.
export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = grazingMoveSchema.parse(body);

    const herd = await getOwnedHerd(data.herdId, org.id);
    if (!herd) return jsonError("Herd not found", 404);

    // A destination is optional: omitting it records a move OFF pasture.
    let destination = null;
    if (data.toLocationId) {
      destination = await getOwnedLocation(data.toLocationId, org.id);
      if (!destination) return jsonError("Paddock not found", 404);
      if (destination.type !== "paddock") {
        return jsonError("Herds can only be moved onto a paddock", 400);
      }
    }

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();

    // Close-then-open must be atomic: without a transaction two concurrent
    // moves can both see no open period (or the same one) and leave the herd
    // with two open grazing periods, corrupting the rotation state.
    const { closed, opened } = await db.transaction(async (tx) => {
      // Close any open period for this herd (the paddock it is leaving).
      const open = await tx.query.grazingEvents.findFirst({
        where: and(
          eq(grazingEvents.herdId, data.herdId),
          eq(grazingEvents.orgId, org.id),
          isNull(grazingEvents.movedOutAt),
        ),
      });

      let closed = null;
      if (open) {
        await tx
          .update(grazingEvents)
          .set({
            movedOutAt: occurredAt,
            ...(data.heightOutIn !== undefined
              ? { heightOutIn: data.heightOutIn }
              : {}),
          })
          .where(eq(grazingEvents.id, open.id));
        const closedRow = await tx.query.grazingEvents.findFirst({
          where: eq(grazingEvents.id, open.id),
        });
        closed = closedRow ? serializeGrazingEvent(closedRow) : null;
      }

      if (!destination) return { closed, opened: null };

      // Open the new period on the destination paddock.
      const id = nanoid();
      await tx.insert(grazingEvents).values({
        id,
        orgId: org.id,
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
      const openedRow = await tx.query.grazingEvents.findFirst({
        where: eq(grazingEvents.id, id),
      });
      return { closed, opened: openedRow ? serializeGrazingEvent(openedRow) : null };
    });

    // Move OFF pasture: just close the open period, open nothing new.
    if (!destination) {
      if (!closed) {
        return jsonError("That herd isn't on a paddock to move off", 400);
      }
      return NextResponse.json({ opened: null, closed }, { status: 200 });
    }

    return NextResponse.json({ opened, closed }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return handleApiError(error, "record move");
  }
}
