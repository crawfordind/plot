import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { attachments, events, locations, photoInsights, plantings } from "@/db/schema";
import { buildLocationPaths } from "@/lib/parse/match";
import { serializeLocation } from "@/lib/serializers";

type LocationRow = typeof locations.$inferSelect;

// Walk from a location up to its root, returning ids root-first.
function ancestryChain(start: LocationRow, byId: Map<string, LocationRow>): LocationRow[] {
  const chain: LocationRow[] = [];
  const seen = new Set<string>();
  let cur: LocationRow | undefined = start;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

// Build a compact, plain-text picture of "what's going on around here" for the
// vision prompt, aggregated live from existing data — the location's place in the
// farm hierarchy, what's planted in/under it, recent activity, and what nearby
// photos already revealed. No stale denormalised blob; always reflects current data.
export async function buildFarmContext(
  location: LocationRow,
  orgId: string,
): Promise<string> {
  const allLocations = await db.query.locations.findMany({
    where: eq(locations.orgId, orgId),
  });
  const byId = new Map(allLocations.map((l) => [l.id, l]));
  const paths = buildLocationPaths(allLocations.map(serializeLocation));
  const pathOf = (id: string) => paths.get(id) ?? byId.get(id)?.name ?? id;

  const chain = ancestryChain(location, byId);
  const root = chain[0];
  const children = allLocations.filter((l) => l.parentId === location.id);

  // This location + everything nested under it — the subtree we summarise.
  const subtreeIds = new Set<string>([location.id]);
  let added = true;
  while (added) {
    added = false;
    for (const l of allLocations) {
      if (l.parentId && subtreeIds.has(l.parentId) && !subtreeIds.has(l.id)) {
        subtreeIds.add(l.id);
        added = true;
      }
    }
  }
  const subtree = [...subtreeIds];

  const [plantingRows, eventRows, insightRows] = await Promise.all([
    db.query.plantings.findMany({
      where: and(eq(plantings.orgId, orgId), inArray(plantings.locationId, subtree)),
      limit: 20,
    }),
    db.query.events.findMany({
      where: and(eq(events.orgId, orgId), inArray(events.locationId, subtree)),
      orderBy: () => [desc(events.occurredAt)],
      limit: 8,
    }),
    db
      .select({
        summary: photoInsights.summary,
        subjectType: photoInsights.subjectType,
        locationId: attachments.locationId,
        createdAt: photoInsights.createdAt,
      })
      .from(photoInsights)
      .innerJoin(attachments, eq(photoInsights.attachmentId, attachments.id))
      .where(
        and(eq(photoInsights.orgId, orgId), inArray(attachments.locationId, subtree)),
      )
      .orderBy(desc(photoInsights.createdAt))
      .limit(6),
  ]);

  const lines: string[] = [];

  if (root && root.id !== location.id) {
    lines.push(`Farm: ${root.name}`);
  }
  lines.push(`This asset: ${pathOf(location.id)} (${location.type})`);
  if (location.zone) lines.push(`Zone: ${location.zone}`);
  if (children.length > 0) {
    lines.push(
      `Contains: ${children
        .slice(0, 12)
        .map((c) => `${c.name} (${c.type})`)
        .join(", ")}`,
    );
  }

  if (plantingRows.length > 0) {
    lines.push("");
    lines.push("Plantings here:");
    for (const p of plantingRows) {
      const where = p.locationId === location.id ? "" : ` @ ${pathOf(p.locationId)}`;
      const variety = p.variety ? ` (${p.variety})` : "";
      lines.push(`- ${p.commonName}${variety} [${p.status}]${where}`);
    }
  }

  if (eventRows.length > 0) {
    lines.push("");
    lines.push("Recent activity:");
    for (const e of eventRows) {
      const when = e.occurredAt.toISOString().slice(0, 10);
      const note = e.notes ? ` — ${e.notes}` : "";
      lines.push(`- ${when}: ${e.type.replace("_", " ")}${note}`);
    }
  }

  if (insightRows.length > 0) {
    lines.push("");
    lines.push("What recent photos here showed:");
    for (const i of insightRows) {
      lines.push(`- [${i.subjectType}] ${i.summary}`);
    }
  }

  return lines.join("\n");
}
