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
import type { ContextSlice } from "./personas";

// A compact, human-readable digest of an org's farm, sliced by topic. We build
// the whole thing once and cache it per org for a short TTL: a chat thread fires
// many turns, and several experts may share a call, so caching turns dozens of
// DB round-trips into one. Sections are plain text (not raw rows) to keep the
// prompt — and therefore cost — small and stable.

type Snapshot = {
  sections: Record<ContextSlice, string>;
  chips: Record<ContextSlice, string[]>;
};

const cache = new Map<string, { expires: number; snapshot: Snapshot }>();
const TTL_MS = 60_000;
const MAX_LIST = 24; // cap any enumerated list so the prompt can't blow up

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
  const sections = {} as Record<ContextSlice, string>;
  const chips = {} as Record<ContextSlice, string[]>;

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

  return { sections, chips };
}

async function getSnapshot(orgId: string): Promise<Snapshot> {
  const hit = cache.get(orgId);
  if (hit && hit.expires > Date.now()) return hit.snapshot;
  const snapshot = await buildSnapshot(orgId);
  cache.set(orgId, { expires: Date.now() + TTL_MS, snapshot });
  return snapshot;
}

// Assemble only the requested slices into a single context block, plus a deduped
// set of "chips" summarizing what the experts can see (shown in the chat UI).
export async function buildFarmContext(
  orgId: string,
  slices: ContextSlice[],
): Promise<{ text: string; chips: string[] }> {
  const snapshot = await getSnapshot(orgId);
  const wanted = [...new Set(slices)];

  const labels: Record<ContextSlice, string> = {
    farm: "FARM MAP",
    crops: "CROPS & PLANTINGS",
    livestock: "LIVESTOCK & GRAZING",
    soil: "SOIL",
    activity: "RECENT ACTIVITY",
  };

  const text = wanted
    .map((slice) => `## ${labels[slice]}\n${snapshot.sections[slice]}`)
    .join("\n\n");

  const chips = [...new Set(wanted.flatMap((slice) => snapshot.chips[slice] ?? []))];

  return { text, chips };
}
