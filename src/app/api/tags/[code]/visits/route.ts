import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { events, tagReads, tags } from "@/db/schema";
import { handleApiError, jsonError, requireOrg } from "@/lib/api";
import { getOwnedTagByCode } from "@/lib/ownership";
import { parseTagCode } from "@/lib/tags/code";
import { serializeEvent } from "@/lib/serializers";
import { tagVisitSchema } from "@/lib/validators";

type Params = { params: Promise<{ code: string }> };

// Log a visit against whatever the tag points at. The scan and the visit land
// together: one tap on "Save & scan next" is one request, and the tag_read row
// carries the event id so the audit trail says which walk produced which record.
//
// Visits are append-only by design. Two crew logging the same tube on the same
// morning both keep their rows — reconciling them is a reporting question, not
// a write conflict, and losing one of them would be worse than having both.
export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  const { code: raw } = await params;
  const code = parseTagCode(raw);
  if (!code) return jsonError("Invalid tag code", 400);

  try {
    const data = tagVisitSchema.parse(await request.json());

    const tag = await getOwnedTagByCode(code, org.id);
    if (!tag) return jsonError("That tag isn't in this workspace", 404);

    const occurredAt = data.occurredAt ? new Date(data.occurredAt) : new Date();
    const eventId = nanoid();

    await db.transaction(async (tx) => {
      await tx.insert(events).values({
        id: eventId,
        orgId: org.id,
        userId: user.id,
        locationId: tag.locationId,
        plantingId: tag.plantingId,
        type: "visit",
        occurredAt,
        notes: data.notes ?? null,
        survival: data.survival ?? null,
        heightCm: data.heightCm ?? null,
        caliperMm: data.caliperMm ?? null,
        heightRef: data.heightRef ?? null,
        damage: data.damage?.length ? JSON.stringify(data.damage) : null,
        tubeCondition: data.tubeCondition ?? null,
        replacedById: data.replacedById ?? null,
        gpsPoint:
          data.lat != null && data.lng != null
            ? JSON.stringify({ type: "Point", coordinates: [data.lng, data.lat] })
            : null,
      });

      await tx.insert(tagReads).values({
        id: nanoid(),
        orgId: org.id,
        tagId: tag.id,
        userId: user.id,
        readVia: data.readVia ?? "nfc",
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        eventId,
        readAt: occurredAt,
      });

      if (!tag.lastReadAt || occurredAt > tag.lastReadAt) {
        await tx
          .update(tags)
          .set({ lastReadAt: occurredAt })
          .where(eq(tags.id, tag.id));
      }
    });

    const row = await db.query.events.findFirst({ where: eq(events.id, eventId) });
    return NextResponse.json({ event: serializeEvent(row!) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "log visit");
  }
}
