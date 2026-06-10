import type { PlantingRecord, LocationRecord } from "@/lib/types";
import type { LlmParseOutput } from "@/lib/parse/schema";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreMatch(query: string, candidate: string) {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;
  if (c === q) return 1;
  if (c.includes(q) || q.includes(c)) return 0.85;
  const qTokens = q.split(" ");
  const matches = qTokens.filter((token) => c.includes(token)).length;
  return matches / qTokens.length;
}

export function matchLocation(
  locationName: string | null,
  locations: LocationRecord[],
  selectedLocationId?: string,
) {
  if (selectedLocationId) {
    const selected = locations.find((l) => l.id === selectedLocationId);
    if (selected) return { id: selected.id, name: selected.name, score: 1 };
  }

  if (!locationName) return null;

  let best: { id: string; name: string; score: number } | null = null;
  for (const location of locations) {
    const score = scoreMatch(locationName, location.name);
    if (!best || score > best.score) {
      best = { id: location.id, name: location.name, score };
    }
  }

  return best && best.score >= 0.5 ? best : null;
}

export function matchPlanting(
  output: LlmParseOutput,
  plantings: PlantingRecord[],
  locationId: string | null,
) {
  const query = [output.commonName, output.variety].filter(Boolean).join(" ");
  if (!query) return null;

  const pool = locationId
    ? plantings.filter((p) => p.locationId === locationId)
    : plantings;

  let best: { id: string; label: string; score: number } | null = null;

  for (const planting of pool) {
    const label = [planting.commonName, planting.variety].filter(Boolean).join(" ");
    const score = Math.max(
      scoreMatch(query, label),
      scoreMatch(output.commonName ?? "", planting.commonName),
      output.variety ? scoreMatch(output.variety, planting.variety ?? "") : 0,
    );
    if (!best || score > best.score) {
      best = { id: planting.id, label, score };
    }
  }

  return best && best.score >= 0.5 ? best : null;
}

export function plantingLabel(planting: PlantingRecord) {
  return [planting.commonName, planting.variety].filter(Boolean).join(" · ");
}
