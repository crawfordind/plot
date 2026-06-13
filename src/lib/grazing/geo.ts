import type { GeoJSONGeometry } from "@/lib/types";

// Meters-per-degree constants, matching src/lib/structure/layout.ts:project so
// areas are consistent with how structures are placed on the map.
const M_PER_DEG_LAT = 110540;
const SQ_M_PER_ACRE = 4046.8564224;

// Geodesic-ish area of a polygon, in acres. We project lng/lat to a local
// meters plane (equirectangular around the ring's mean latitude) and apply the
// shoelace formula — accurate to well within a percent at field scale.
export function polygonAreaAcres(geometry: GeoJSONGeometry): number {
  if (geometry.type !== "Polygon") return 0;
  const ring = geometry.coordinates[0];
  if (!ring || ring.length < 4) return 0;

  const meanLat =
    ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length;
  const mPerDegLng = 111320 * Math.cos((meanLat * Math.PI) / 180);

  // Project to meters relative to the first vertex.
  const [lng0, lat0] = ring[0];
  const pts = ring.map(([lng, lat]): [number, number] => [
    (lng - lng0) * mPerDegLng,
    (lat - lat0) * M_PER_DEG_LAT,
  ]);

  let twiceArea = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    twiceArea += x1 * y2 - x2 * y1;
  }

  const areaSqM = Math.abs(twiceArea) / 2;
  return areaSqM / SQ_M_PER_ACRE;
}

// Resolve a paddock's usable acreage: explicit override wins, else from geometry.
export function paddockAcres(
  override: number | null | undefined,
  geometry: GeoJSONGeometry,
): number {
  if (override && override > 0) return override;
  return polygonAreaAcres(geometry);
}
