import type { GeoJSONGeometry, LocationType } from "@/lib/types";

// Meters-per-degree, matching src/lib/structure/layout.ts and grazing/geo.ts.
const M_PER_DEG_LAT = 110540;

export type SubdividedPaddock = {
  tempId: string;
  parentId: string;
  name: string;
  type: LocationType;
  geometry: GeoJSONGeometry;
};

// Split a field's polygon into `count` roughly-equal paddock strips along its
// long axis. We strip the field's bounding box (predictable for the typical
// rectangular field) and project back to lng/lat. Each paddock is parented to
// the existing field via parentId.
export function subdivideField(
  fieldId: string,
  geometry: GeoJSONGeometry,
  count: number,
  baseName = "Paddock",
): SubdividedPaddock[] {
  if (geometry.type !== "Polygon") return [];
  const ring = geometry.coordinates[0];
  if (!ring || ring.length < 4 || count < 1) return [];

  const meanLat = ring.reduce((s, [, lat]) => s + lat, 0) / ring.length;
  const mPerDegLng = 111320 * Math.cos((meanLat * Math.PI) / 180);
  const [lng0, lat0] = ring[0];

  // Project ring to local meters and take the bounding box.
  const pts = ring.map(([lng, lat]): [number, number] => [
    (lng - lng0) * mPerDegLng,
    (lat - lat0) * M_PER_DEG_LAT,
  ]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  const alongX = w >= h;

  const toLngLat = (x: number, y: number): [number, number] => [
    lng0 + x / mPerDegLng,
    lat0 + y / M_PER_DEG_LAT,
  ];

  const out: SubdividedPaddock[] = [];
  for (let i = 0; i < count; i++) {
    let x1: number, x2: number, y1: number, y2: number;
    if (alongX) {
      x1 = minX + (w * i) / count;
      x2 = minX + (w * (i + 1)) / count;
      y1 = minY;
      y2 = maxY;
    } else {
      x1 = minX;
      x2 = maxX;
      y1 = minY + (h * i) / count;
      y2 = minY + (h * (i + 1)) / count;
    }
    const corners: [number, number][] = [
      toLngLat(x1, y1),
      toLngLat(x2, y1),
      toLngLat(x2, y2),
      toLngLat(x1, y2),
      toLngLat(x1, y1),
    ];
    out.push({
      tempId: `p${i}`,
      parentId: fieldId,
      name: `${baseName} ${i + 1}`,
      type: "paddock",
      geometry: { type: "Polygon", coordinates: [corners] },
    });
  }
  return out;
}
