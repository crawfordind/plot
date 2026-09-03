import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { events, locations, organizations, plantings, tags } from "@/db/schema";
import { rankLocationsByDistance } from "@/lib/capture/nearest";
import {
  serializeEvent,
  serializeLocation,
  serializePlanting,
  serializeTag,
} from "@/lib/serializers";
import type {
  GrowthPoint,
  HeightUnit,
  NearbyCandidate,
  TagResolution,
} from "@/lib/types";

// How many past visits the scan landing shows before "Full record".
const RECENT_VISIT_LIMIT = 3;

// How far a crew could plausibly be standing from the record they mean. GPS is
// ±3–5 m and tubes sit 2–3 m apart, so anything past this is a different row,
// not a mis-fix.
export const NEARBY_RADIUS_M = 10;

export async function getOrgHeightUnit(orgId: string): Promise<HeightUnit> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { heightUnit: true },
  });
  return org?.heightUnit ?? "cm";
}

// Everything the scan landing needs in one round trip: identity, the two
// actions' context, the growth curve and the last few visits. One query set, so
// a tap on one bar of signal still paints a complete screen.
export async function resolveTag(
  tagCode: string,
  orgId: string,
): Promise<TagResolution | null> {
  const tag = await db.query.tags.findFirst({
    where: and(eq(tags.tagCode, tagCode), eq(tags.orgId, orgId)),
  });
  if (!tag) return null;

  const location = await db.query.locations.findFirst({
    where: and(eq(locations.id, tag.locationId), eq(locations.orgId, orgId)),
  });
  // The tag points at a location that has since been deleted. Treat it as
  // unknown so the caller offers recovery rather than rendering a broken hero.
  if (!location) return null;

  const planting = tag.plantingId
    ? ((await db.query.plantings.findFirst({
        where: and(eq(plantings.id, tag.plantingId), eq(plantings.orgId, orgId)),
      })) ?? null)
    : null;

  // Visits are keyed on the location, not the tag, which is exactly why a
  // replacement tag inherits the full history: the record never moved.
  const visitRows = await db.query.events.findMany({
    where: and(
      eq(events.orgId, orgId),
      eq(events.locationId, location.id),
      eq(events.type, "visit"),
    ),
    orderBy: [desc(events.occurredAt)],
  });

  const growth: GrowthPoint[] = visitRows
    .filter((row) => row.heightCm != null)
    .map((row) => ({
      occurredAt: row.occurredAt.toISOString(),
      heightCm: row.heightCm as number,
    }))
    .reverse();

  return {
    tag: serializeTag(tag),
    location: serializeLocation(location),
    planting: planting ? serializePlanting(planting) : null,
    recentVisits: visitRows.slice(0, RECENT_VISIT_LIMIT).map(serializeEvent),
    growth,
    heightUnit: await getOrgHeightUnit(orgId),
  };
}

// An unknown tag is never a dead end. Given where the phone is standing, offer
// the records close enough to be what the crew is actually looking at — so a
// re-tag lands on the existing history instead of forking a duplicate tube.
export async function nearbyCandidates(
  orgId: string,
  lng: number,
  lat: number,
  radiusM = NEARBY_RADIUS_M,
): Promise<NearbyCandidate[]> {
  const rows = await db.query.locations.findMany({
    where: eq(locations.orgId, orgId),
  });

  const ranked = rankLocationsByDistance(rows.map(serializeLocation), lng, lat)
    .filter((r) => r.meters !== null && r.meters <= radiusM)
    .slice(0, 8);
  if (ranked.length === 0) return [];

  // Pull the tag each candidate already carries, so the list can say "tag lost
  // 3 Jul" — the strongest hint about which record this is.
  const tagRows = await db.query.tags.findMany({
    where: and(
      eq(tags.orgId, orgId),
      inArray(
        tags.locationId,
        ranked.map((r) => r.location.id),
      ),
    ),
  });
  const tagByLocation = new Map(tagRows.map((t) => [t.locationId, t]));

  return ranked.map((r) => {
    const existing = tagByLocation.get(r.location.id);
    return {
      location: r.location,
      meters: r.meters,
      lastTagStatus: existing?.status ?? null,
      lastReadAt: existing?.lastReadAt ? existing.lastReadAt.toISOString() : null,
    };
  });
}
