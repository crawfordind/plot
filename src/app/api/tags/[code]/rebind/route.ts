import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { tagReads, tags } from "@/db/schema";
import { handleApiError, jsonError, requireOrg, requireRole } from "@/lib/api";
import { getOwnedTagByCode } from "@/lib/ownership";
import { parseTagCode } from "@/lib/tags/code";
import { serializeTag } from "@/lib/serializers";
import { rebindTagSchema } from "@/lib/validators";

type Params = { params: Promise<{ code: string }> };

// Point a fresh tag at the record an old one held. `code` is the OLD tag; the
// body carries the new one.
//
// This is a server-side operation, not a field re-write, because a tag is set
// read-only the instant it is written — makeReadOnly() cannot be undone. It is
// gated on admin because re-pointing identity is the one action that can quietly
// corrupt a season of history.
//
// Alias, don't replace: the old row keeps its locationId and is retired, and the
// new row records aliasOfTagId. So both codes resolve to the same record, and if
// the "lost" tag turns up in the grass next spring it still lands on its own
// history instead of looking like a stranger.
export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;
  const forbidden = requireRole(org.role, "admin");
  if (forbidden) return forbidden;

  const { code: raw } = await params;
  const oldCode = parseTagCode(raw);
  if (!oldCode) return jsonError("Invalid tag code", 400);

  try {
    const data = rebindTagSchema.parse(await request.json());
    if (data.tagCode === oldCode) {
      return jsonError("The replacement must be a different tag", 400);
    }

    const oldTag = await getOwnedTagByCode(oldCode, org.id);
    if (!oldTag) return jsonError("That tag isn't in this workspace", 404);

    const clash = await db.query.tags.findFirst({
      where: eq(tags.tagCode, data.tagCode),
    });
    if (clash) return jsonError("That tag code is already in use", 409);

    const newTagId = nanoid();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(tags).values({
        id: newTagId,
        orgId: org.id,
        tagCode: data.tagCode,
        chipUid: data.chipUid ?? null,
        kind: data.kind ?? oldTag.kind,
        scope: oldTag.scope,
        // The record is what carries the history, and it does not move.
        locationId: oldTag.locationId,
        plantingId: oldTag.plantingId,
        status: "active",
        aliasOfTagId: oldTag.id,
        writtenLat: data.lat ?? oldTag.writtenLat,
        writtenLng: data.lng ?? oldTag.writtenLng,
        writtenBy: user.id,
        writtenAt: now,
        lastReadAt: now,
      });

      await tx
        .update(tags)
        .set({ status: "retired" })
        .where(eq(tags.id, oldTag.id));

      await tx.insert(tagReads).values({
        id: nanoid(),
        orgId: org.id,
        tagId: newTagId,
        userId: user.id,
        readVia: data.kind === "qr" ? "qr" : "nfc",
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        readAt: now,
      });
    });

    const created = await db.query.tags.findFirst({ where: eq(tags.id, newTagId) });
    const retired = await db.query.tags.findFirst({ where: eq(tags.id, oldTag.id) });

    return NextResponse.json(
      { tag: serializeTag(created!), retired: serializeTag(retired!) },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "rebind tag");
  }
}
