import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { batchGeometrySchema } from "@/lib/validators";

// PATCH /api/locations/geometry — update many location geometries in one call.
// Used when a transform on a parent location (move/rotate/resize) is applied to
// its descendants so they move in relation. Only the caller's own rows change.
export async function PATCH(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const { updates } = batchGeometrySchema.parse(body);

    const ids = updates.map((u) => u.id);
    const owned = await db.query.locations.findMany({
      where: and(eq(locations.orgId, org.id), inArray(locations.id, ids)),
      columns: { id: true },
    });
    const ownedIds = new Set(owned.map((r) => r.id));

    const applicable = updates.filter((u) => ownedIds.has(u.id));
    if (applicable.length === 0) return jsonError("No matching locations", 404);

    await db.transaction(async (tx) => {
      for (const u of applicable) {
        await tx
          .update(locations)
          .set({ geometry: JSON.stringify(u.geometry) })
          .where(eq(locations.id, u.id));
      }
    });

    return NextResponse.json({ updated: applicable.length });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update geometries", 500);
  }
}
