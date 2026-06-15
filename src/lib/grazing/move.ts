import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { grazingEvents } from "@/db/schema";
import { getOwnedHerd, getOwnedLocation } from "@/lib/ownership";
import { serializeGrazingEvent } from "@/lib/serializers";
import type { GrazingEventRecord } from "@/lib/types";

// Shared herd-move logic, used by both the /api/grazing/move route and the
// agent's move_herd tool. Applying a move closes the herd's open grazing period
// (recording the move-off height) and opens a new one on the destination. A move
// with no destination records a move OFF pasture (closes only).

export type HerdMoveInput = {
  orgId: string;
  userId: string;
  herdId: string;
  // Omit/null to move the herd OFF pasture (closes the open period, opens none).
  toLocationId?: string | null;
  occurredAt?: string;
  heightInIn?: number;
  heightOutIn?: number;
  forageSpecies?: string;
  notes?: string;
};

export type HerdMoveResult = {
  opened: GrazingEventRecord | null;
  closed: GrazingEventRecord | null;
  herdName: string;
  destinationName: string | null;
};

// A move can fail for reasons callers must translate differently (the route → an
// HTTP status, the agent tool → a sentence). A typed error carries the status so
// neither has to sniff the message string.
export class HerdMoveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HerdMoveError";
  }
}

export async function applyHerdMove(input: HerdMoveInput): Promise<HerdMoveResult> {
  const herd = await getOwnedHerd(input.herdId, input.orgId);
  if (!herd) throw new HerdMoveError("Herd not found", 404);

  // A destination is optional: omitting it records a move OFF pasture.
  let destination = null;
  if (input.toLocationId) {
    destination = await getOwnedLocation(input.toLocationId, input.orgId);
    if (!destination) throw new HerdMoveError("Paddock not found", 404);
    if (destination.type !== "paddock") {
      throw new HerdMoveError("Herds can only be moved onto a paddock", 400);
    }
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  // Close-then-open must be atomic: without a transaction two concurrent moves
  // can both see no open period (or the same one) and leave the herd with two
  // open grazing periods, corrupting the rotation state.
  const { closed, opened } = await db.transaction(async (tx) => {
    const open = await tx.query.grazingEvents.findFirst({
      where: and(
        eq(grazingEvents.herdId, input.herdId),
        eq(grazingEvents.orgId, input.orgId),
        isNull(grazingEvents.movedOutAt),
      ),
    });

    let closed = null;
    if (open) {
      await tx
        .update(grazingEvents)
        .set({
          movedOutAt: occurredAt,
          ...(input.heightOutIn !== undefined
            ? { heightOutIn: input.heightOutIn }
            : {}),
        })
        .where(eq(grazingEvents.id, open.id));
      const closedRow = await tx.query.grazingEvents.findFirst({
        where: eq(grazingEvents.id, open.id),
      });
      closed = closedRow ? serializeGrazingEvent(closedRow) : null;
    }

    if (!destination) return { closed, opened: null };

    const id = nanoid();
    await tx.insert(grazingEvents).values({
      id,
      orgId: input.orgId,
      userId: input.userId,
      herdId: input.herdId,
      locationId: destination.id,
      movedInAt: occurredAt,
      movedOutAt: null,
      heightInIn: input.heightInIn ?? null,
      heightOutIn: null,
      forageSpecies: input.forageSpecies ?? null,
      notes: input.notes ?? null,
    });
    const openedRow = await tx.query.grazingEvents.findFirst({
      where: eq(grazingEvents.id, id),
    });
    return { closed, opened: openedRow ? serializeGrazingEvent(openedRow) : null };
  });

  // Move OFF pasture with nothing open to close is a no-op the caller should hear
  // about, not a silent success.
  if (!destination && !closed) {
    throw new HerdMoveError("That herd isn't on a paddock to move off", 400);
  }

  return {
    opened,
    closed,
    herdName: herd.name,
    destinationName: destination?.name ?? null,
  };
}
