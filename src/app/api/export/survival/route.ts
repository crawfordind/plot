import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, locations, plantings, tags } from "@/db/schema";
import { requireOrg } from "@/lib/api";
import { getOrgHeightUnit } from "@/lib/tags/resolve";
import { cmToDisplay, roundForUnit, unitLabel } from "@/lib/tags/units";
import type { DamageKind } from "@/lib/types";

// One row per tagged tube, carrying its latest visit — the shape a cost-share
// grant asks for, assembled from taps nobody had to transcribe. Sits alongside
// the existing NRCS-528 grazing export.
function headers(unit: string) {
  return [
    "Tube",
    "Block",
    "Tag code",
    "Tag status",
    "Species",
    "Source stock",
    "Planted",
    "Last visit",
    "Survival",
    `Height (${unit})`,
    `First height (${unit})`,
    `Growth (${unit})`,
    "Caliper (mm)",
    "Height reference",
    "Damage",
    "Tube condition",
    "Visits",
    "Last scanned",
  ];
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function parseDamage(raw: string | null): string {
  if (!raw) return "";
  try {
    const list = JSON.parse(raw) as DamageKind[];
    return Array.isArray(list) ? list.join(" | ") : "";
  } catch {
    return "";
  }
}

// `?locationId=` narrows to one block (the tubes nested under it); omitted, the
// export covers every tagged tube in the workspace.
export async function GET(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { searchParams } = new URL(request.url);
  const blockId = searchParams.get("locationId");

  const [tagRows, locationRows, plantingRows, visitRows, unit] = await Promise.all([
    db.query.tags.findMany({ where: eq(tags.orgId, org.id) }),
    db.query.locations.findMany({ where: eq(locations.orgId, org.id) }),
    db.query.plantings.findMany({ where: eq(plantings.orgId, org.id) }),
    db.query.events.findMany({
      where: and(eq(events.orgId, org.id), eq(events.type, "visit")),
      orderBy: (table, { asc }) => [asc(table.occurredAt)],
    }),
    getOrgHeightUnit(org.id),
  ]);

  const locById = new Map(locationRows.map((l) => [l.id, l]));
  const plantingById = new Map(plantingRows.map((p) => [p.id, p]));

  // Visits grouped by the record they belong to, oldest first, so the first and
  // last entries give the growth delta directly.
  const visitsByLocation = new Map<string, typeof visitRows>();
  for (const v of visitRows) {
    if (!v.locationId) continue;
    const bucket = visitsByLocation.get(v.locationId);
    if (bucket) bucket.push(v);
    else visitsByLocation.set(v.locationId, [v]);
  }

  const inBlock = (locationId: string): boolean => {
    if (!blockId) return true;
    // Walk up the parent chain; a tube counts if the block is any ancestor.
    const seen = new Set<string>();
    let node = locById.get(locationId);
    while (node) {
      if (node.id === blockId) return true;
      if (!node.parentId || seen.has(node.id)) break;
      seen.add(node.id);
      node = locById.get(node.parentId);
    }
    return false;
  };

  const label = unitLabel(unit);
  const lines = [headers(label).map(csvCell).join(",")];

  // Retired tags are the old half of a replacement pair; their record is already
  // represented by the tag that took over, so listing both double-counts the
  // tube in a survival percentage.
  const exported = tagRows
    .filter((t) => t.status !== "retired")
    .filter((t) => inBlock(t.locationId))
    .sort((a, b) => {
      const an = locById.get(a.locationId)?.name ?? "";
      const bn = locById.get(b.locationId)?.name ?? "";
      return an.localeCompare(bn, undefined, { numeric: true });
    });

  for (const tag of exported) {
    const loc = locById.get(tag.locationId);
    const block = loc?.parentId ? locById.get(loc.parentId) : null;
    const planting = tag.plantingId ? plantingById.get(tag.plantingId) : null;
    const visits = visitsByLocation.get(tag.locationId) ?? [];
    const last = visits.length ? visits[visits.length - 1] : null;

    const heightsCm = visits
      .map((v) => v.heightCm)
      .filter((h): h is number => h != null);
    const firstCm = heightsCm.length ? heightsCm[0] : null;
    const lastCm = heightsCm.length ? heightsCm[heightsCm.length - 1] : null;
    const growthCm =
      firstCm != null && lastCm != null && heightsCm.length > 1 ? lastCm - firstCm : null;

    const show = (cm: number | null) =>
      cm == null ? "" : roundForUnit(cmToDisplay(cm, unit), unit);

    lines.push(
      [
        csvCell(loc?.name ?? ""),
        csvCell(block?.name ?? ""),
        csvCell(tag.tagCode),
        csvCell(tag.status),
        csvCell(planting?.commonName ?? ""),
        csvCell(planting?.source ?? ""),
        csvCell(fmtDate(planting?.sownAt ?? planting?.transplantedAt ?? null)),
        csvCell(fmtDate(last?.occurredAt ?? null)),
        csvCell(last?.survival ?? ""),
        csvCell(show(lastCm)),
        csvCell(show(firstCm)),
        csvCell(show(growthCm)),
        csvCell(last?.caliperMm ?? ""),
        csvCell(last?.heightRef ?? ""),
        csvCell(parseDamage(last?.damage ?? null)),
        csvCell(last?.tubeCondition ?? ""),
        csvCell(visits.length),
        csvCell(fmtDate(tag.lastReadAt ?? null)),
      ].join(","),
    );
  }

  const csv = lines.join("\r\n");
  const today = new Date().toISOString().slice(0, 10);
  const scope = blockId ? locById.get(blockId)?.name?.replace(/[^\w-]+/g, "-") : null;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="survival${
        scope ? `-${scope}` : ""
      }-${today}.csv"`,
    },
  });
}
