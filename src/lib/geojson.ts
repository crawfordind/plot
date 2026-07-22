import type { GeoJSONGeometry } from "@/lib/types";

// RFC 7946 GeoJSON. Coordinates are WGS84 lon/lat (EPSG:4326 / OGC:CRS84) — the
// format mandates it and QGIS assumes it, so no `crs` member is emitted.
type Feature = {
  type: "Feature";
  id?: string;
  geometry: GeoJSONGeometry | null;
  properties: Record<string, unknown>;
};

export type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

// Parse a stored geometry string; returns null (a valid GeoJSON null-geometry
// feature) rather than throwing, so one bad row can't break the whole export.
function parseGeometry(raw: string): GeoJSONGeometry | null {
  try {
    return JSON.parse(raw) as GeoJSONGeometry;
  } catch {
    return null;
  }
}

export function featureCollection(
  rows: { id: string; geometry: string; properties: Record<string, unknown> }[],
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({
      type: "Feature",
      id: r.id,
      geometry: parseGeometry(r.geometry),
      properties: r.properties,
    })),
  };
}

// A geo+json response with a download filename, so QGIS (and browsers) treat it
// as a layer/file rather than inline text.
export function geojsonResponse(data: FeatureCollection, filename: string): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
