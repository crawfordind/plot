import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { locations, tags } from "@/db/schema";
import { handleApiError, requireOrg } from "@/lib/api";
import { serializeTag } from "@/lib/serializers";
import type { TagHealthSummary } from "@/lib/types";

// How long a tag may go unread before it counts as failing. One season is the
// honest default: a tube walked twice a year and silent for both is a tag
// problem, not a quiet tree. §12 of the spec leaves a per-block override open.
const DEFAULT_SILENT_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

// Counts plus the silent list behind the Tag health screen. Silence is the
// signal the whole recovery story rests on: surfacing a stopped tag BEFORE the
// survival count quietly goes wrong is the point.
export async function GET(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const { searchParams } = new URL(request.url);
    const requested = Number(searchParams.get("silentAfterDays"));
    const silentAfterDays =
      Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_SILENT_DAYS;
    const cutoff = new Date(Date.now() - silentAfterDays * DAY_MS);

    const rows = await db.query.tags.findMany({
      where: eq(tags.orgId, org.id),
    });

    const locationRows = await db.query.locations.findMany({
      where: eq(locations.orgId, org.id),
      columns: { id: true, name: true },
    });
    const nameById = new Map(locationRows.map((l) => [l.id, l.name]));

    // A retired tag is one we replaced on purpose — it is not a failure, and
    // counting it as one would make every successful recovery look like a new
    // problem.
    const live = rows.filter((t) => t.status !== "retired");
    const lost = live.filter((t) => t.status === "lost");
    const silent = live.filter(
      (t) =>
        t.status === "active" && (t.lastReadAt == null || t.lastReadAt < cutoff),
    );
    const readingFine = live.filter(
      (t) =>
        t.status === "active" && t.lastReadAt != null && t.lastReadAt >= cutoff,
    );

    const summary: TagHealthSummary = {
      total: live.length,
      readingFine: readingFine.length,
      silent: silent.length,
      lost: lost.length,
      silentAfterDays,
      silentTags: silent
        .sort((a, b) => (a.lastReadAt?.getTime() ?? 0) - (b.lastReadAt?.getTime() ?? 0))
        .slice(0, 100)
        .map((tag) => ({
          tag: serializeTag(tag),
          locationName: nameById.get(tag.locationId) ?? "Unknown location",
        })),
    };

    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error, "load tag health");
  }
}
