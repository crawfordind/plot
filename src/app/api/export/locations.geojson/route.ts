import { eq } from "drizzle-orm";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { handleApiError, requireExportAuth } from "@/lib/api";
import { featureCollection, geojsonResponse } from "@/lib/geojson";

// GET /api/export/locations.geojson — every mapped area in the org as a GeoJSON
// FeatureCollection (EPSG:4326), ready to load in QGIS as a vector layer. Auth is
// a personal access token (Authorization: Bearer … or ?token=…) or a session.
export async function GET(request: Request) {
  const auth = await requireExportAuth(request);
  if (auth.response) return auth.response;
  const { orgId } = auth;

  try {
    const rows = await db.query.locations.findMany({
      where: eq(locations.orgId, orgId),
    });

    const fc = featureCollection(
      rows.map((l) => ({
        id: l.id,
        geometry: l.geometry,
        properties: {
          name: l.name,
          type: l.type,
          zone: l.zone,
          parentId: l.parentId,
        },
      })),
    );

    return geojsonResponse(fc, "plot-locations.geojson");
  } catch (error) {
    return handleApiError(error, "export locations");
  }
}
