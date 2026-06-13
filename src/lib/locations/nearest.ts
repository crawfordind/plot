import { eq } from "drizzle-orm";
import { db } from "@/db";
import { locations } from "@/db/schema";
import type { GeoJSONGeometry } from "@/lib/types";

type LocationRow = typeof locations.$inferSelect;

// Rough centroid of a GeoJSON geometry as [lng, lat]. Good enough for picking the
// nearest feature to a phone's GPS fix.
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

// Squared equirectangular distance (meters²) — monotonic, so fine for comparison.
function distSq(a: [number, number], b: [number, number]): number {
  const meanLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const mPerDegLng = 111320 * Math.cos(meanLat);
  const dx = (a[0] - b[0]) * mPerDegLng;
  const dy = (a[1] - b[1]) * 110540;
  return dx * dx + dy * dy;
}

// Resolve the org location closest to a GPS fix, for photos taken in the field
// with no asset selected. Falls back to the farm root, then any location. Returns
// null only when the org has no locations at all.
export async function resolveNearestLocation(
  lat: number,
  lng: number,
  orgId: string,
): Promise<string | null> {
  const rows = await db.query.locations.findMany({
    where: eq(locations.orgId, orgId),
  });
  if (rows.length === 0) return null;

  const target: [number, number] = [lng, lat];
  let best: { id: string; d: number } | null = null;
  for (const row of rows) {
    let geometry: GeoJSONGeometry;
    try {
      geometry = JSON.parse(row.geometry) as GeoJSONGeometry;
    } catch {
      continue;
    }
    const c = centroid(geometry);
    if (!c) continue;
    const d = distSq(target, c);
    if (!best || d < best.d) best = { id: row.id, d };
  }
  if (best) return best.id;

  const root =
    rows.find((r: LocationRow) => r.type === "farm" && !r.parentId) ??
    rows.find((r: LocationRow) => !r.parentId) ??
    rows[0];
  return root.id;
}
