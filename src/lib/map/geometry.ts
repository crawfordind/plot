import type { GeoJSONGeometry } from "@/lib/types";

// Helpers for editing/drawing geometries on the map. Kept dependency-free and
// consistent with the app's hand-rolled geo math (src/lib/grazing/geo.ts).

// The draggable vertices of a geometry (polygon ring without its closing dup).
export function geometryVertices(g: GeoJSONGeometry): [number, number][] {
  if (g.type === "Point") return [g.coordinates];
  if (g.type === "LineString") return g.coordinates;
  // Polygon: outer ring, drop the closing point (same as the first).
  const ring = g.coordinates[0] ?? [];
  return ring.slice(0, Math.max(ring.length - 1, 0));
}

// Move vertex `idx` to a new lng/lat, returning a new geometry.
export function moveVertex(
  g: GeoJSONGeometry,
  idx: number,
  lng: number,
  lat: number,
): GeoJSONGeometry {
  if (g.type === "Point") {
    return { type: "Point", coordinates: [lng, lat] };
  }
  if (g.type === "LineString") {
    const coords = g.coordinates.map((c, i) =>
      i === idx ? ([lng, lat] as [number, number]) : c,
    );
    return { type: "LineString", coordinates: coords };
  }
  // Polygon: update the vertex; if it's the first, keep the closing point in sync.
  const ring = g.coordinates[0] ?? [];
  const open = ring.slice(0, Math.max(ring.length - 1, 0));
  const next = open.map((c, i) =>
    i === idx ? ([lng, lat] as [number, number]) : c,
  );
  next.push(next[0]); // re-close
  return { type: "Polygon", coordinates: [next] };
}

// Shift every vertex by a lng/lat delta (translate the whole feature).
export function translateGeometry(
  g: GeoJSONGeometry,
  dLng: number,
  dLat: number,
): GeoJSONGeometry {
  const shift = ([lng, lat]: [number, number]): [number, number] => [
    lng + dLng,
    lat + dLat,
  ];
  if (g.type === "Point") return { type: "Point", coordinates: shift(g.coordinates) };
  if (g.type === "LineString")
    return { type: "LineString", coordinates: g.coordinates.map(shift) };
  return { type: "Polygon", coordinates: g.coordinates.map((r) => r.map(shift)) };
}

// Turn an in-progress list of tapped points into a previewable geometry.
export function pointsToGeometry(points: [number, number][]): GeoJSONGeometry | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { type: "Point", coordinates: points[0] };
  if (points.length === 2) return { type: "LineString", coordinates: points };
  return { type: "Polygon", coordinates: [[...points, points[0]]] };
}

// Close an in-progress drawing into a polygon (needs ≥3 points).
export function closePolygon(points: [number, number][]): GeoJSONGeometry | null {
  if (points.length < 3) return null;
  return { type: "Polygon", coordinates: [[...points, points[0]]] };
}
