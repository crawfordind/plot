import { getSeasonLabel } from "@/lib/coach/season";
import type { EventRecord, EventType, LocationRecord, PlantingRecord } from "@/lib/types";

export type CoachInsight = {
  id: string;
  kind: "prompt" | "nudge" | "celebration" | "setup";
  message: string;
  logStarter?: string;
};

export type CoachSnapshot = {
  seasonLabel: string;
  loggingStreak: number;
  logsThisWeek: number;
  seasonCompleteness: number;
  selectedLocationName: string | null;
  insights: CoachInsight[];
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}

function computeStreak(events: EventRecord[]) {
  if (events.length === 0) return 0;

  const days = new Set(
    events.map((event) => startOfDay(new Date(event.occurredAt)).toISOString()),
  );

  let streak = 0;
  const today = startOfDay(new Date());

  for (let offset = 0; offset < 30; offset += 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - offset);
    if (days.has(day.toISOString())) {
      streak += 1;
    } else if (offset > 0) {
      break;
    }
  }

  return streak;
}

function computeSeasonCompleteness(events: EventRecord[]) {
  const seasonStart = new Date();
  seasonStart.setMonth(seasonStart.getMonth() - 2);
  const recent = events.filter((event) => new Date(event.occurredAt) >= seasonStart);
  const types = new Set(recent.map((event) => event.type));
  const pillars: EventType[] = ["sow", "observe", "harvest"];
  const hit = pillars.filter((type) => types.has(type)).length;
  return Math.round((hit / pillars.length) * 100);
}

export function buildCoachSnapshot(
  locations: LocationRecord[],
  plantings: PlantingRecord[],
  events: EventRecord[],
  selectedLocationId?: string | null,
): CoachSnapshot {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const logsThisWeek = events.filter((event) => new Date(event.occurredAt) >= weekAgo).length;
  const selectedLocation = locations.find((l) => l.id === selectedLocationId) ?? null;
  const insights: CoachInsight[] = [];

  if (locations.length === 0) {
    insights.push({
      id: "setup-location",
      kind: "setup",
      message: "Drop your first pin on the map — every log gets easier once locations exist.",
    });
    return {
      seasonLabel: getSeasonLabel(now),
      loggingStreak: 0,
      logsThisWeek: 0,
      seasonCompleteness: 0,
      selectedLocationName: null,
      insights,
    };
  }

  if (plantings.length === 0) {
    insights.push({
      id: "setup-planting",
      kind: "setup",
      message: "Add a planting so logs auto-link to the right crop or variety.",
      logStarter: selectedLocation
        ? `Started a new planting in ${selectedLocation.name} today — `
        : "Started a new planting today — ",
    });
  }

  const recentByLocation = selectedLocation
    ? events.filter((e) => e.locationId === selectedLocation.id)
    : events;
  const lastLog = recentByLocation[0];
  const daysSinceLastLog = lastLog
    ? daysBetween(now, new Date(lastLog.occurredAt))
    : Number.POSITIVE_INFINITY;

  if (daysSinceLastLog >= 5) {
    insights.push({
      id: "nudge-quiet",
      kind: "nudge",
      message: selectedLocation
        ? `No logs at ${selectedLocation.name} in ${daysSinceLastLog} days — a quick observe note keeps the season story intact.`
        : `It's been ${daysSinceLastLog} days since your last log — what's changed in the field?`,
      logStarter: selectedLocation
        ? `Quick observe at ${selectedLocation.name}: `
        : "Quick observe: ",
    });
  }

  const activePlantings = plantings.filter((p) => p.status === "active");
  const withoutRecentActivity = activePlantings.filter((planting) => {
    const plantingEvents = events.filter(
      (event) =>
        event.plantingId === planting.id &&
        new Date(event.occurredAt) >= weekAgo,
    );
    return plantingEvents.length === 0;
  });

  if (withoutRecentActivity.length > 0 && withoutRecentActivity.length <= 3) {
    const names = withoutRecentActivity
      .slice(0, 2)
      .map((p) => p.commonName)
      .join(", ");
    insights.push({
      id: "prompt-quiet-plantings",
      kind: "prompt",
      message: `No recent notes on ${names} — worth a mid-season check?`,
      logStarter: `${withoutRecentActivity[0].commonName} looking good at ${locations.find((l) => l.id === withoutRecentActivity[0].locationId)?.name ?? "the field"} — `,
    });
  }

  const streak = computeStreak(events);
  if (streak >= 3) {
    insights.push({
      id: "celebration-streak",
      kind: "celebration",
      message: `${streak}-day logging streak — this is how year-over-year insights get built.`,
    });
  }

  const completeness = computeSeasonCompleteness(events);
  if (completeness < 100 && logsThisWeek > 0) {
    const missing =
      completeness === 0
        ? "planting, observe, and outcome"
        : completeness < 67
          ? "a mid-season observe or outcome"
          : "an outcome or harvest";
    insights.push({
      id: "prompt-completeness",
      kind: "prompt",
      message: `Season completeness is ${completeness}% — still missing ${missing} logs this season.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "prompt-default",
      kind: "prompt",
      message: selectedLocation
        ? `What's happening at ${selectedLocation.name} today?`
        : "What happened in the field today?",
      logStarter: selectedLocation ? `At ${selectedLocation.name}, ` : "",
    });
  }

  return {
    seasonLabel: getSeasonLabel(now),
    loggingStreak: streak,
    logsThisWeek,
    seasonCompleteness: completeness,
    selectedLocationName: selectedLocation?.name ?? null,
    insights: insights.slice(0, 3),
  };
}
