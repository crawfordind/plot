import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { tagReads, tags } from "@/db/schema";
import { handleApiError, jsonError, requireOrg } from "@/lib/api";
import { getOwnedEvent, getOwnedTagByCode } from "@/lib/ownership";
import { parseTagCode } from "@/lib/tags/code";
import { serializeTagRead } from "@/lib/serializers";
import { tagReadBatchSchema, tagReadSchema } from "@/lib/validators";

type Params = { params: Promise<{ code: string }> };

// The scans on a tag, newest first. This is the evidence behind the silent-tag
// report: a tube nobody has tapped in a season has a failing tag, not a
// mysteriously absent tree.
export async function GET(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { code: raw } = await params;
  const code = parseTagCode(raw);
  if (!code) return jsonError("Invalid tag code", 400);

  const tag = await getOwnedTagByCode(code, org.id);
  if (!tag) return jsonError("That tag isn't in this workspace", 404);

  const rows = await db.query.tagReads.findMany({
    where: eq(tagReads.tagId, tag.id),
    orderBy: (table, { desc }) => [desc(table.readAt)],
    limit: 200,
  });

  return NextResponse.json({ reads: rows.map(serializeTagRead) });
}

// Record one scan, or a batch when an offline queue drains. Reads are
// append-only, so replaying a batch twice duplicates rows rather than losing
// them — the safer failure for an audit trail, and the reason `lastReadAt` is
// derived from the newest read rather than incremented.
export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  const { code: raw } = await params;
  const code = parseTagCode(raw);
  if (!code) return jsonError("Invalid tag code", 400);

  try {
    const body = await request.json();
    // Accept both shapes: a single read from a live scan, and { reads: [...] }
    // from a queue flush.
    const parsed =
      body && typeof body === "object" && "reads" in body
        ? tagReadBatchSchema.parse(body).reads
        : [tagReadSchema.parse(body ?? {})];

    const tag = await getOwnedTagByCode(code, org.id);
    if (!tag) return jsonError("That tag isn't in this workspace", 404);

    for (const read of parsed) {
      if (read.eventId && !(await getOwnedEvent(read.eventId, org.id))) {
        return jsonError("Unknown eventId", 400);
      }
    }

    const now = new Date();
    const rows = parsed.map((read) => ({
      id: nanoid(),
      orgId: org.id,
      tagId: tag.id,
      userId: user.id,
      readVia: read.readVia ?? "nfc",
      lat: read.lat ?? null,
      lng: read.lng ?? null,
      eventId: read.eventId ?? null,
      // A queued read carries the time it actually happened, not the time it
      // finally reached the server — otherwise a week offline collapses a
      // fortnight of walking into one afternoon.
      readAt: read.readAt ? new Date(read.readAt) : now,
    }));

    await db.insert(tagReads).values(rows);

    // Advance the health clock only forwards, so draining a stale queue can
    // never make a tag look quieter than it is.
    const newest = rows.reduce(
      (max, r) => (r.readAt > max ? r.readAt : max),
      new Date(0),
    );
    if (!tag.lastReadAt || newest > tag.lastReadAt) {
      await db.update(tags).set({ lastReadAt: newest }).where(eq(tags.id, tag.id));
    }

    return NextResponse.json(
      {
        reads: rows.map((r) => ({
          id: r.id,
          tagId: r.tagId,
          readVia: r.readVia,
          lat: r.lat,
          lng: r.lng,
          eventId: r.eventId,
          readAt: r.readAt.toISOString(),
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, "record tag read");
  }
}
