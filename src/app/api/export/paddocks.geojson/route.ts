import { eq } from "drizzle-orm";
import { db } from "@/db";
import { locations, paddocks } from "@/db/schema";
import { handleApiError, requireExportAuth } from "@/lib/api";
import { featureCollection, geojsonResponse } from "@/lib/geojson";

// GET /api/export/paddocks.geojson — grazing paddocks as GeoJSON, carrying the
// NRCS-style attributes (forage, rest target, start/stop heights) alongside the
// geometry so they're available for analysis in QGIS. Geometry lives on the
// linked location row; the paddock row holds the agronomy.
export async function GET(request: Request) {
  const { orgId, response } = await requireExportAuth(request);
  if (!orgId) return response;

  try {
    const [paddockRows, locationRows] = await Promise.all([
      db.query.paddocks.findMany({ where: eq(paddocks.orgId, orgId) }),
      db.query.locations.findMany({ where: eq(locations.orgId, orgId) }),
    ]);
    const locById = new Map(locationRows.map((l) => [l.id, l]));

    const rows = paddockRows
      .map((p) => {
        const loc = locById.get(p.locationId);
        if (!loc) return null;
        return {
          id: p.id,
          geometry: loc.geometry,
          properties: {
            name: loc.name,
            primaryForage: p.primaryForage,
            acres: p.acres,
            restTargetDays: p.restTargetDays,
            startHeightIn: p.startHeightIn,
            stopHeightIn: p.stopHeightIn,
            notes: p.notes,
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return geojsonResponse(featureCollection(rows), "plot-paddocks.geojson");
  } catch (error) {
    return handleApiError(error, "export paddocks");
  }
}
