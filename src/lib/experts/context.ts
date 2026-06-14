import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  events,
  grazingEvents,
  herds,
  locations,
  paddocks,
  photoInsights,
  plantings,
  seasons,
} from "@/db/schema";
import {
  farmCenter,
  getFarmEnvironment,
  type FarmEnvironment,
} from "@/lib/weather/environment";
import type { ContextSlice } from "./personas";

// A compact, human-readable digest of an org's farm, sliced by topic. We build
// the whole thing once and cache it per org for a short TTL: a chat thread fires
// many turns, and several experts may share a call, so caching turns dozens of
// DB round-trips into one. Sections are plain text (not raw rows) to keep the
// prompt — and therefore cost — small and stable.

// Every slice except `environment` is org-wide and lives in `sections`. The
// `environment` slice is per-farm and focus-aware (it depends on which farm the
// user is looking at, which varies per request), so it's assembled later from
// `farmEnvs` rather than baked into the cached text.
type StaticSlice = Exclude<ContextSlice, "environment">;

type FarmEnvEntry = { farmId: string; farmName: string; env: FarmEnvironment };

type Snapshot = {
  sections: Record<StaticSlice, string>;
  chips: Record<StaticSlice, string[]>;
  farmEnvs: FarmEnvEntry[];
};

const cache = new Map<string, { expires: number; snapshot: Snapshot }>();
const TTL_MS = 60_000;
const MAX_LIST = 24; // cap any enumerated list so the prompt can't blow up
const MAX_FARMS = 8; // bound the per-farm weather fan-out (real farms rarely exceed this)

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function tallyBy<T>(rows: T[], key: (r: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// Photo insights are an optional enrichment (and the newest table); never let a
// missing/failed read take down the whole chat — just degrade to no photo data.
async function readInsights(orgId: string) {
  try {
    return await db.query.photoInsights.findMany({
      where: eq(photoInsights.orgId, orgId),
      orderBy: [desc(photoInsights.createdAt)],
      limit: 20,
    });
  } catch {
    return [];
  }
}

async function buildSnapshot(orgId: string): Promise<Snapshot> {
  const [
    locationRows,
    plantingRows,
    seasonRows,
    herdRows,
    paddockRows,
    openGrazing,
    eventRows,
    insightRows,
  ] = await Promise.all([
    db.query.locations.findMany({ where: eq(locations.orgId, orgId) }),
    db.query.plantings.findMany({ where: eq(plantings.orgId, orgId) }),
    db.query.seasons.findMany({
      where: and(eq(seasons.orgId, orgId), eq(seasons.status, "active")),
    }),
    db.query.herds.findMany({ where: eq(herds.orgId, orgId) }),
    db.query.paddocks.findMany({ where: eq(paddocks.orgId, orgId) }),
    db.query.grazingEvents.findMany({
      where: and(eq(grazingEvents.orgId, orgId), isNull(grazingEvents.movedOutAt)),
    }),
    db.query.events.findMany({
      where: eq(events.orgId, orgId),
      orderBy: [desc(events.occurredAt)],
      limit: 20,
    }),
    readInsights(orgId),
  ]);

  const nameById = new Map(locationRows.map((l) => [l.id, l.name]));
  const sections = {} as Record<StaticSlice, string>;
  const chips = {} as Record<StaticSlice, string[]>;

  // --- environment (per-farm date, place, weather & forecast) ---
  // Group every mapped area under its root farm, then fetch weather once per
  // farm from that farm's own center. Best-effort and self-caching;
  // getFarmEnvironment never throws.
  const farmGroups = groupByFarm(locationRows);
  let farmEnvs: FarmEnvEntry[];
  if (farmGroups.length === 0) {
    // Nothing mapped yet — still surface the date via the null-center path.
    const env = await getFarmEnvironment(null);
    farmEnvs = [{ farmId: "", farmName: "Your farm", env }];
  } else {
    farmEnvs = await Promise.all(
      farmGroups.slice(0, MAX_FARMS).map(async (g) => ({
        farmId: g.id,
        farmName: g.name,
        env: await getFarmEnvironment(farmCenter(g.geometryJson)),
      })),
    );
  }

  // --- farm ---
  {
    const byType = tallyBy(locationRows, (l) => l.type);
    const typeSummary = [...byType.entries()].map(([t, n]) => `${n} ${t}`).join(", ");
    const named = locationRows.slice(0, MAX_LIST).map((l) => l.name);
    const zones = [...new Set(locationRows.map((l) => l.zone).filter(Boolean))];
    sections.farm = locationRows.length
      ? [
          `The farm map has ${locationRows.length} mapped areas (${typeSummary}).`,
          `Named areas: ${named.join(", ")}${locationRows.length > MAX_LIST ? ", …" : ""}.`,
          zones.length ? `Zone(s) on record: ${zones.join(", ")}.` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "No areas have been mapped yet.";
    chips.farm = [`${locationRows.length} mapped areas`];
  }

  // --- crops ---
  {
    const active = plantingRows.filter((p) => p.status === "active");
    const byCrop = tallyBy(active, (p) =>
      p.variety ? `${p.commonName} '${p.variety}'` : p.commonName,
    );
    const cropList = [...byCrop.entries()]
      .slice(0, MAX_LIST)
      .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
      .join(", ");
    const season = seasonRows.map((s) => s.label).join(", ");
    sections.crops = active.length
      ? [
          season ? `Active season: ${season}.` : "",
          `Active plantings (${active.length}): ${cropList}${byCrop.size > MAX_LIST ? ", …" : ""}.`,
        ]
          .filter(Boolean)
          .join("\n")
      : "No active plantings are recorded.";
    chips.crops = [`${active.length} active crops`];
  }

  // --- livestock ---
  {
    const herdLines = herdRows
      .slice(0, MAX_LIST)
      .map(
        (h) =>
          `${h.name}: ${h.headCount} ${h.species} @ ~${Math.round(h.avgWeightLb)} lb`,
      );
    const totalHead = herdRows.reduce((sum, h) => sum + h.headCount, 0);
    const grazingLines = openGrazing.map((g) => {
      const days = Math.max(
        0,
        Math.round((Date.now() - g.movedInAt.getTime()) / 86_400_000),
      );
      return `A herd is grazing ${nameById.get(g.locationId) ?? "a paddock"} (in since ${shortDate(g.movedInAt)}, ${days}d).`;
    });
    sections.livestock = herdRows.length
      ? [
          `Herds (${herdRows.length}, ${totalHead} head total):`,
          herdLines.map((l) => `- ${l}`).join("\n"),
          paddockRows.length ? `${paddockRows.length} paddock(s) configured for grazing.` : "",
          grazingLines.length ? grazingLines.join("\n") : "No herds are currently out grazing.",
        ]
          .filter(Boolean)
          .join("\n")
      : "No livestock herds are recorded.";
    chips.livestock = herdRows.length ? [`${herdRows.length} herds (${totalHead} head)`] : [];
  }

  // --- soil ---
  {
    const zones = [...new Set(locationRows.map((l) => l.zone).filter(Boolean))];
    const amend = eventRows.filter((e) => e.type === "amend");
    const soilPhotos = insightRows.filter((i) => i.subjectType === "soil");
    sections.soil = [
      zones.length ? `Zone(s): ${zones.join(", ")}.` : "Zone not recorded.",
      amend.length
        ? `Recent soil amendments (${amend.length}): ${amend
            .slice(0, 8)
            .map((e) => `${shortDate(e.occurredAt)} ${nameById.get(e.locationId ?? "") ?? ""}`.trim())
            .join("; ")}.`
        : "No soil amendment events logged.",
      soilPhotos.length
        ? `Soil photo observations:\n${soilPhotos
            .slice(0, 6)
            .map((i) => `- ${i.summary}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    chips.soil = soilPhotos.length ? [`${soilPhotos.length} soil photo reads`] : [];
  }

  // --- activity ---
  {
    const lines = eventRows.slice(0, 15).map((e) => {
      const where = e.locationId ? ` (${nameById.get(e.locationId) ?? "?"})` : "";
      const note = (e.notes ?? e.rawText ?? "").trim().slice(0, 80);
      const qty = e.quantity != null ? ` ${e.quantity}${e.unit ? ` ${e.unit}` : ""}` : "";
      return `- ${shortDate(e.occurredAt)} ${e.type}${where}${qty}${note ? `: ${note}` : ""}`;
    });
    sections.activity = eventRows.length
      ? `Recent activity log (latest ${lines.length}):\n${lines.join("\n")}`
      : "No activity has been logged yet.";
    chips.activity = [`${eventRows.length} recent logs`];
  }

  return { sections, chips, farmEnvs };
}

// Group every location under its root farm (the topmost ancestor reached by
// walking parentId). The root's name labels the farm; we keep all member
// geometries so the farm's center is the median of everything mapped in it.
// Cycle-guarded against bad parent data. Order is preserved (newest farm first,
// since locations come back createdAt-desc).
type LocRow = { id: string; name: string; parentId: string | null; geometry: string };
type FarmGroup = { id: string; name: string; geometryJson: string[] };

function groupByFarm(rows: LocRow[]): FarmGroup[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rootOf = (start: LocRow): LocRow => {
    let node = start;
    const seen = new Set<string>([node.id]);
    while (node.parentId) {
      const parent = byId.get(node.parentId);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      node = parent;
    }
    return node;
  };

  const groups = new Map<string, FarmGroup>();
  const order: string[] = [];
  for (const r of rows) {
    const root = rootOf(r);
    let g = groups.get(root.id);
    if (!g) {
      g = { id: root.id, name: root.name, geometryJson: [] };
      groups.set(root.id, g);
      order.push(root.id);
    }
    g.geometryJson.push(r.geometry);
  }
  return order.map((id) => groups.get(id)!);
}

async function getSnapshot(orgId: string): Promise<Snapshot> {
  const hit = cache.get(orgId);
  if (hit && hit.expires > Date.now()) return hit.snapshot;
  const snapshot = await buildSnapshot(orgId);
  cache.set(orgId, { expires: Date.now() + TTL_MS, snapshot });
  return snapshot;
}

// Render the per-farm environment, foregrounding the farm the user is currently
// looking at on the map. With one farm it's just that farm's full digest; with
// several, the in-view farm gets the full digest and the rest a one-line summary,
// plus an instruction so the experts answer about the right farm (or all of them).
function assembleEnvironment(
  farmEnvs: FarmEnvEntry[],
  focusedFarmId: string | null,
): { text: string; chips: string[] } {
  if (farmEnvs.length === 0) return { text: "Location not available.", chips: [] };
  if (farmEnvs.length === 1) {
    return { text: farmEnvs[0].env.text, chips: farmEnvs[0].env.chips };
  }

  const focused =
    farmEnvs.find((f) => f.farmId === focusedFarmId) ?? farmEnvs[0];
  const others = farmEnvs.filter((f) => f !== focused);

  const lines = [
    `The farmer has ${farmEnvs.length} farms mapped and is currently viewing **${focused.farmName}** on the map. ` +
      `Unless they name a different farm or ask about all of them, answer about ${focused.farmName}.`,
    "",
    `### ${focused.farmName} — in view`,
    focused.env.text,
  ];
  for (const o of others) {
    lines.push("", `### ${o.farmName}`, o.env.summary);
  }
  return { text: lines.join("\n"), chips: focused.env.chips };
}

// Assemble only the requested slices into a single context block, plus a deduped
// set of "chips" summarizing what the experts can see (shown in the chat UI).
// `focusedFarmId` is the farm currently in the map viewport, if any.
export async function buildFarmContext(
  orgId: string,
  slices: ContextSlice[],
  focusedFarmId?: string | null,
): Promise<{ text: string; chips: string[] }> {
  const snapshot = await getSnapshot(orgId);
  const wanted = [...new Set(slices)];

  const labels: Record<ContextSlice, string> = {
    environment: "DATE, PLACE & WEATHER",
    farm: "FARM MAP",
    crops: "CROPS & PLANTINGS",
    livestock: "LIVESTOCK & GRAZING",
    soil: "SOIL",
    activity: "RECENT ACTIVITY",
  };

  const environment = assembleEnvironment(snapshot.farmEnvs, focusedFarmId ?? null);

  const text = wanted
    .map((slice) => {
      const body =
        slice === "environment" ? environment.text : snapshot.sections[slice];
      return `## ${labels[slice]}\n${body}`;
    })
    .join("\n\n");

  const chips = [
    ...new Set(
      wanted.flatMap((slice) =>
        slice === "environment" ? environment.chips : (snapshot.chips[slice] ?? []),
      ),
    ),
  ];

  return { text, chips };
}
