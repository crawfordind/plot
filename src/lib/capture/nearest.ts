import type { GeoJSONGeometry, LocationRecord } from "@/lib/types";

// Client-side nearest-asset ranking for the global capture sheet: given the
// phone's GPS fix (or the map centre as a fallback), order the org's locations by
// distance so we can pre-select the most likely asset and offer the rest as a
// sorted list. Mirrors the server-side resolver in src/lib/locations/nearest.ts.

function centroid(geometry: GeoJSONGeometry): [number, number] | null {
  if (geometry.type === "Point") return geometry.coordinates;
  const ring =
    geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates;
  if (!ring || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [lng, lat] of ring) {
    sx += lng;
    sy += lat;
  }
  return [sx / ring.length, sy / ring.length];
}

// Approximate ground distance in metres (equirectangular — fine at field scale).
function meters(a: [number, number], b: [number, number]): number {
  const meanLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const mPerDegLng = 111320 * Math.cos(meanLat);
  const dx = (a[0] - b[0]) * mPerDegLng;
  const dy = (a[1] - b[1]) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

export type RankedLocation = {
  location: LocationRecord;
  meters: number | null;
};

// Locations ranked nearest-first to [lng, lat]. Locations whose distance can't be
// computed sort to the end with meters=null.
export function rankLocationsByDistance(
  locations: LocationRecord[],
  lng: number,
  lat: number,
): RankedLocation[] {
  const target: [number, number] = [lng, lat];
  return locations
    .map((location) => {
      const c = centroid(location.geometry);
      return { location, meters: c ? meters(target, c) : null };
    })
    .sort((a, b) => {
      if (a.meters === null) return 1;
      if (b.meters === null) return -1;
      return a.meters - b.meters;
    });
}

export function formatDistance(m: number | null): string {
  if (m === null) return "";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
