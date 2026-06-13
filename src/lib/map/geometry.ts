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

const DEG = Math.PI / 180;

// Apply a coordinate transform to every vertex, preserving the geometry shape.
function mapCoords(
  g: GeoJSONGeometry,
  fn: (c: [number, number]) => [number, number],
): GeoJSONGeometry {
  if (g.type === "Point") return { type: "Point", coordinates: fn(g.coordinates) };
  if (g.type === "LineString")
    return { type: "LineString", coordinates: g.coordinates.map(fn) };
  return { type: "Polygon", coordinates: g.coordinates.map((ring) => ring.map(fn)) };
}

// Visit each [lng, lat] of a geometry.
export function eachVertex(
  g: GeoJSONGeometry,
  fn: (lng: number, lat: number) => void,
) {
  if (g.type === "Point") fn(g.coordinates[0], g.coordinates[1]);
  else if (g.type === "LineString") g.coordinates.forEach((c) => fn(c[0], c[1]));
  else g.coordinates.forEach((ring) => ring.forEach((c) => fn(c[0], c[1])));
}

// Centroid (mean of vertices) of a geometry — the pivot for rotate/scale.
export function geometryCenter(g: GeoJSONGeometry): [number, number] {
  let sx = 0,
    sy = 0,
    n = 0;
  eachVertex(g, (lng, lat) => {
    sx += lng;
    sy += lat;
    n++;
  });
  return n ? [sx / n, sy / n] : [0, 0];
}

// Bounding box [[minLng, minLat], [maxLng, maxLat]] of one or more geometries.
export function geometryBounds(
  geometries: GeoJSONGeometry[],
): [[number, number], [number, number]] | null {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const g of geometries) {
    eachVertex(g, (lng, lat) => {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    });
  }
  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

// A rectangular Polygon covering the combined bounds of several geometries.
// Used as the synthetic "primary" shape when transforming a multi-selection:
// the gizmo anchors on this bbox and applies the same move/scale/rotate to every
// real member, so a set of components moves and resizes as one. Slightly padded
// so the handles sit just outside the members.
export function boundsPolygon(
  geometries: GeoJSONGeometry[],
  padFraction = 0.04,
): GeoJSONGeometry | null {
  const b = geometryBounds(geometries);
  if (!b) return null;
  const [[minLng, minLat], [maxLng, maxLat]] = b;
  const padLng = Math.max((maxLng - minLng) * padFraction, 1e-6);
  const padLat = Math.max((maxLat - minLat) * padFraction, 1e-6);
  const w = minLng - padLng,
    e = maxLng + padLng,
    s = minLat - padLat,
    n = maxLat + padLat;
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}

// Rotate a geometry by `deg` degrees (clockwise on screen) about `center`.
// Projects to a local meters plane (lng scaled by cos(lat)) so the rotation is
// not skewed by longitude compression, then unprojects.
export function rotateGeometry(
  g: GeoJSONGeometry,
  deg: number,
  center: [number, number],
): GeoJSONGeometry {
  const [clng, clat] = center;
  const cosLat = Math.cos(clat * DEG) || 1e-6;
  const t = deg * DEG;
  const cosT = Math.cos(t);
  const sinT = Math.sin(t);
  return mapCoords(g, ([lng, lat]) => {
    const x = (lng - clng) * cosLat;
    const y = lat - clat;
    const xr = x * cosT - y * sinT;
    const yr = x * sinT + y * cosT;
    return [clng + xr / cosLat, clat + yr];
  });
}

// Uniformly scale a geometry by `factor` about `center`. Scaling lng and lat
// offsets by the same factor preserves the on-screen aspect ratio.
export function scaleGeometry(
  g: GeoJSONGeometry,
  factor: number,
  center: [number, number],
): GeoJSONGeometry {
  const [clng, clat] = center;
  return mapCoords(g, ([lng, lat]) => [
    clng + (lng - clng) * factor,
    clat + (lat - clat) * factor,
  ]);
}

// Ray-casting point-in-polygon test against a polygon's outer ring.
export function pointInPolygon(
  lng: number,
  lat: number,
  g: GeoJSONGeometry,
): boolean {
  if (g.type !== "Polygon") return false;
  const ring = g.coordinates[0];
  if (!ring || ring.length < 4) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Pick the farm a point falls in (preferred), else the nearest farm by centroid
// distance. Used to decide which farm a newly-placed asset belongs to.
export function farmAtPoint<T extends { geometry: GeoJSONGeometry }>(
  farms: T[],
  lng: number,
  lat: number,
): T | null {
  if (farms.length === 0) return null;
  const containing = farms.find((f) => pointInPolygon(lng, lat, f.geometry));
  if (containing) return containing;
  let best: T | null = null;
  let bestDist = Infinity;
  for (const f of farms) {
    const [clng, clat] = geometryCenter(f.geometry);
    const d = (clng - lng) ** 2 + (clat - lat) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}
