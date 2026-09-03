import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { locations, plantings, tagReads, tags } from "@/db/schema";
import { handleApiError, jsonError, requireOrg } from "@/lib/api";
import { getOwnedLocation, getOwnedVariety } from "@/lib/ownership";
import { serializeLocation, serializePlanting, serializeTag } from "@/lib/serializers";
import { createTagSchema } from "@/lib/validators";

// List the org's tags. `locationId` narrows to one record's tags (a tube can
// carry a replacement plus the retired original).
export async function GET(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const status = searchParams.get("status");

  const rows = await db.query.tags.findMany({
    where: (table, { and: andFn, eq: eqFn }) => {
      const clauses = [eqFn(table.orgId, org.id)];
      if (locationId) clauses.push(eqFn(table.locationId, locationId));
      if (status === "active" || status === "lost" || status === "retired" || status === "unbound") {
        clauses.push(eqFn(table.status, status));
      }
      return andFn(...clauses);
    },
    orderBy: (table, { desc }) => [desc(table.writtenAt)],
  });

  return NextResponse.json({ tags: rows.map(serializeTag) });
}

// Bind a freshly written tag: mint the row, and in the same transaction create
// the location and planting it points at when this is a new tube. One
// transaction because a half-written tag — a code on a chip with no record
// behind it — is the one failure the field can't recover from.
export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const data = createTagSchema.parse(await request.json());

    // The code is minted on the device. If it is already ours, this is a retry
    // of a request that actually succeeded (a flaky connection, a queue drain
    // replayed twice) — hand back the same tag rather than a 409, so the client
    // can be naively idempotent.
    const existing = await db.query.tags.findFirst({
      where: eq(tags.tagCode, data.tagCode),
    });
    if (existing) {
      if (existing.orgId !== org.id) {
        // Never confirm that another workspace holds this code.
        return jsonError("That tag code is not available", 409);
      }
      const location = await getOwnedLocation(existing.locationId, org.id);
      return NextResponse.json({
        tag: serializeTag(existing),
        location: location ? serializeLocation(location) : null,
        planting: null,
        reused: true,
      });
    }

    if (data.locationId) {
      const owned = await getOwnedLocation(data.locationId, org.id);
      if (!owned) return jsonError("Unknown locationId", 400);
    }
    if (data.parentId) {
      const owned = await getOwnedLocation(data.parentId, org.id);
      if (!owned) return jsonError("Unknown parentId", 400);
    }
    if (data.planting?.varietyId) {
      const owned = await getOwnedVariety(data.planting.varietyId, org.id);
      if (!owned) return jsonError("Unknown varietyId", 400);
    }

    const result = await db.transaction(async (tx) => {
      // One timestamp for the whole bind: the location, the planting, the tag
      // and its first read all happened in the same gesture, and reading the
      // clock four times would let them disagree.
      const now = new Date();
      let locationId = data.locationId ?? null;
      let createdLocation = null;

      if (!locationId) {
        const id = nanoid();
        await tx.insert(locations).values({
          id,
          orgId: org.id,
          userId: user.id,
          name: data.name!,
          // A tagged tube is a tree marker on the map — the same point type the
          // catalog already uses, so it renders and exports with no new layer.
          type: "tree",
          parentId: data.parentId ?? null,
          geometry: JSON.stringify({
            type: "Point",
            coordinates: [data.lng!, data.lat!],
          }),
        });
        locationId = id;
        createdLocation = await tx.query.locations.findFirst({
          where: eq(locations.id, id),
        });
      }

      let createdPlanting = null;
      if (data.planting) {
        const plantingId = nanoid();
        await tx.insert(plantings).values({
          id: plantingId,
          orgId: org.id,
          userId: user.id,
          locationId,
          varietyId: data.planting.varietyId ?? null,
          plantType: "tree",
          commonName: data.planting.commonName,
          variety: data.planting.variety ?? null,
          source: data.planting.source ?? null,
          // Encoding a tag in the field happens at the moment of planting, so
          // this write IS the planting date. Nursery stock into a tube is a
          // transplant, not a sow. Without it the scan landing has no "planted"
          // line and the survival export has no establishment date.
          transplantedAt: now,
        });
        createdPlanting = await tx.query.plantings.findFirst({
          where: eq(plantings.id, plantingId),
        });
      }

      const tagId = nanoid();
      await tx.insert(tags).values({
        id: tagId,
        orgId: org.id,
        tagCode: data.tagCode,
        chipUid: data.chipUid ?? null,
        kind: data.kind ?? "nfc",
        scope: data.scope ?? "tube",
        locationId,
        plantingId: createdPlanting?.id ?? null,
        status: "active",
        writtenLat: data.lat ?? null,
        writtenLng: data.lng ?? null,
        writtenBy: user.id,
        writtenAt: now,
        // Writing a tag is itself the first read: the chip answered.
        lastReadAt: now,
      });

      await tx.insert(tagReads).values({
        id: nanoid(),
        orgId: org.id,
        tagId,
        userId: user.id,
        readVia: data.kind === "qr" ? "qr" : "nfc",
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        readAt: now,
      });

      const tag = await tx.query.tags.findFirst({ where: eq(tags.id, tagId) });
      return { tag: tag!, location: createdLocation, planting: createdPlanting };
    });

    const location =
      result.location ??
      (await db.query.locations.findFirst({
        where: and(eq(locations.id, result.tag.locationId), eq(locations.orgId, org.id)),
      }));

    return NextResponse.json(
      {
        tag: serializeTag(result.tag),
        location: location ? serializeLocation(location) : null,
        planting: result.planting ? serializePlanting(result.planting) : null,
        reused: false,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "bind tag");
  }
}
