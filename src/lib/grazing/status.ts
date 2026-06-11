import { paddockAcres } from "@/lib/grazing/geo";
import type {
  GrazingEventRecord,
  HerdRecord,
  LocationRecord,
  PaddockRecord,
  PaddockStatus,
} from "@/lib/types";

// Deterministic rotation state + advice, mirroring src/lib/coach/insights.ts.
// No LLM: rest-day math is exact and free, so the advisor is reliable.

export type GrazingAdvisory = {
  id: string;
  kind: "move" | "warning" | "info" | "setup";
  message: string;
};

export type PaddockState = {
  locationId: string;
  name: string;
  status: PaddockStatus;
  restDays: number | null; // days since last moved off (null = grazing/never)
  restTargetDays: number | null;
  daysOn: number | null; // days the current herd has been on (if grazing)
  herdId: string | null;
  acres: number;
  primaryForage: string | null;
  startHeightIn: number | null;
  stopHeightIn: number | null;
};

export type HerdState = {
  herdId: string;
  name: string;
  currentLocationId: string | null;
  currentLocationName: string | null;
  daysOn: number | null;
};

export type GrazingSnapshot = {
  paddocks: PaddockState[];
  herds: HerdState[];
  statusByLocation: Record<string, PaddockStatus>;
  advisories: GrazingAdvisory[];
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date) {
  return Math.round(
    (startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000,
  );
}

export function buildGrazingSnapshot(
  herds: HerdRecord[],
  paddockConfigs: PaddockRecord[],
  locations: LocationRecord[],
  events: GrazingEventRecord[],
  now: Date = new Date(),
): GrazingSnapshot {
  const configByLocation = new Map(paddockConfigs.map((p) => [p.locationId, p]));
  const herdById = new Map(herds.map((h) => [h.id, h]));

  // Paddock locations = map features of type "paddock". A config row is optional.
  const paddockLocations = locations.filter((l) => l.type === "paddock");

  const paddocks: PaddockState[] = paddockLocations.map((loc) => {
    const cfg = configByLocation.get(loc.id) ?? null;
    const locEvents = events
      .filter((e) => e.locationId === loc.id)
      .sort(
        (a, b) =>
          new Date(b.movedInAt).getTime() - new Date(a.movedInAt).getTime(),
      );

    const openEvent = locEvents.find((e) => e.movedOutAt === null) ?? null;
    const restTargetDays = cfg?.restTargetDays ?? null;
    const acres = paddockAcres(cfg?.acres, loc.geometry);

    let status: PaddockStatus;
    let restDays: number | null = null;
    let daysOn: number | null = null;
    let herdId: string | null = null;

    if (openEvent) {
      status = "grazing";
      herdId = openEvent.herdId;
      daysOn = daysBetween(now, new Date(openEvent.movedInAt));
    } else {
      const lastClosed = locEvents.find((e) => e.movedOutAt);
      if (!lastClosed) {
        status = "idle"; // never grazed → fully rested
      } else {
        restDays = daysBetween(now, new Date(lastClosed.movedOutAt!));
        status =
          restTargetDays != null && restDays < restTargetDays
            ? "resting"
            : "ready";
      }
    }

    return {
      locationId: loc.id,
      name: loc.name,
      status,
      restDays,
      restTargetDays,
      daysOn,
      herdId,
      acres,
      primaryForage: cfg?.primaryForage ?? null,
      startHeightIn: cfg?.startHeightIn ?? null,
      stopHeightIn: cfg?.stopHeightIn ?? null,
    };
  });

  const statusByLocation: Record<string, PaddockStatus> = {};
  for (const p of paddocks) statusByLocation[p.locationId] = p.status;

  // Per-herd current location, from each herd's open event.
  const herdStates: HerdState[] = herds.map((herd) => {
    const open = events.find(
      (e) => e.herdId === herd.id && e.movedOutAt === null,
    );
    const loc = open
      ? (locations.find((l) => l.id === open.locationId) ?? null)
      : null;
    return {
      herdId: herd.id,
      name: herd.name,
      currentLocationId: open?.locationId ?? null,
      currentLocationName: loc?.name ?? null,
      daysOn: open ? daysBetween(now, new Date(open.movedInAt)) : null,
    };
  });

  const advisories = buildAdvisories(
    herds,
    herdById,
    paddocks,
    herdStates,
    events,
  );

  return { paddocks, herds: herdStates, statusByLocation, advisories };
}

// A grazeable paddock the longest-rested goes first. Idle (never grazed) is
// treated as fully rested.
function grazeableRanked(paddocks: PaddockState[]): PaddockState[] {
  return paddocks
    .filter((p) => p.status === "ready" || p.status === "idle")
    .sort((a, b) => {
      const ra = a.status === "idle" ? Infinity : (a.restDays ?? 0);
      const rb = b.status === "idle" ? Infinity : (b.restDays ?? 0);
      return rb - ra;
    });
}

function buildAdvisories(
  herds: HerdRecord[],
  herdById: Map<string, HerdRecord>,
  paddocks: PaddockState[],
  herdStates: HerdState[],
  events: GrazingEventRecord[],
): GrazingAdvisory[] {
  const advisories: GrazingAdvisory[] = [];

  if (herds.length === 0) {
    advisories.push({
      id: "setup-herd",
      kind: "setup",
      message: "Add your herd (species, head count, average weight) to start tracking rotations.",
    });
  }
  if (paddocks.length === 0) {
    advisories.push({
      id: "setup-paddocks",
      kind: "setup",
      message: "Subdivide a field into paddocks (Plan tab) so you can rotate stock and track rest.",
    });
  }
  if (herds.length === 0 || paddocks.length === 0) return advisories;

  const ranked = grazeableRanked(paddocks);
  // A rough graze period per paddock from the rotation: rest target spread
  // across the other paddocks. Used to flag an over-stay.
  const targets = paddocks
    .map((p) => p.restTargetDays)
    .filter((d): d is number => d != null);
  const restTarget = targets.length
    ? Math.round(targets.reduce((s, d) => s + d, 0) / targets.length)
    : null;
  const grazeDays =
    restTarget && paddocks.length > 1
      ? Math.max(1, Math.round(restTarget / (paddocks.length - 1)))
      : null;

  for (const hs of herdStates) {
    const herd = herdById.get(hs.herdId)!;

    if (!hs.currentLocationId) {
      // Herd is off-pasture; recommend a move onto the best-rested paddock.
      const target = ranked[0];
      if (target) {
        advisories.push({
          id: `move-${herd.id}`,
          kind: "move",
          message: `${herd.name} isn't on pasture — move onto ${target.name}${describeRest(target)}.`,
        });
      }
      continue;
    }

    // Over-stay nudge.
    if (grazeDays != null && hs.daysOn != null && hs.daysOn >= grazeDays) {
      const target = ranked.find((p) => p.locationId !== hs.currentLocationId);
      const tail = target
        ? ` Move onto ${target.name}${describeRest(target)}.`
        : " No paddock has met its rest target yet — check forage height before moving.";
      advisories.push({
        id: `overstay-${herd.id}`,
        kind: "move",
        message: `${herd.name} has been on ${hs.currentLocationName} for ${hs.daysOn} day${hs.daysOn === 1 ? "" : "s"}.${tail}`,
      });
    }
  }

  // Overgrazing: the most recent move-off in the last 14 days that came off
  // below the paddock's prescribed "stop" grazing height (NRCS 528).
  const paddockByLocation = new Map(paddocks.map((p) => [p.locationId, p]));
  const closedRecent = events
    .filter((e) => e.movedOutAt != null && e.heightOutIn != null)
    .sort(
      (a, b) =>
        new Date(b.movedOutAt!).getTime() - new Date(a.movedOutAt!).getTime(),
    );
  const flaggedLocations = new Set<string>();
  for (const ev of closedRecent) {
    const paddock = paddockByLocation.get(ev.locationId);
    if (!paddock || paddock.stopHeightIn == null) continue;
    if (flaggedLocations.has(ev.locationId)) continue;
    const daysAgo = daysBetween(new Date(), new Date(ev.movedOutAt!));
    if (daysAgo > 14) continue;
    if (ev.heightOutIn! < paddock.stopHeightIn) {
      flaggedLocations.add(ev.locationId);
      advisories.push({
        id: `overgraze-${ev.locationId}`,
        kind: "warning",
        message: `${paddock.name} was grazed to ${ev.heightOutIn}″ — below its ${paddock.stopHeightIn}″ stop height. Give it extra recovery to avoid overgrazing.`,
      });
    }
  }

  if (advisories.length === 0) {
    const ready = paddocks.filter((p) => p.status === "ready" || p.status === "idle").length;
    advisories.push({
      id: "info-ok",
      kind: "info",
      message:
        ready > 0
          ? `Rotation looks healthy — ${ready} paddock${ready === 1 ? "" : "s"} rested and ready when you need them.`
          : "Rotation looks healthy — every paddock is grazing or still recovering.",
    });
  }

  return advisories.slice(0, 4);
}

function describeRest(p: PaddockState): string {
  if (p.status === "idle") return " (not yet grazed)";
  if (p.restDays == null) return "";
  const target = p.restTargetDays != null ? ` of ${p.restTargetDays}` : "";
  return ` (rested ${p.restDays}${target} day${p.restDays === 1 ? "" : "s"})`;
}
