import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { locations, paddocks } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { subdivideField } from "@/lib/grazing/subdivide";
import { getOwnedLocation } from "@/lib/ownership";
import { serializeLocation, serializePaddock } from "@/lib/serializers";
import type { GeoJSONGeometry } from "@/lib/types";
import { subdivideRequestSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = subdivideRequestSchema.parse(body);

    const field = await getOwnedLocation(data.fieldId, org.id);
    if (!field) return jsonError("Field not found", 404);

    const geometry = JSON.parse(field.geometry) as GeoJSONGeometry;
    if (geometry.type !== "Polygon") {
      return jsonError("Only an area (polygon) field can be subdivided", 400);
    }

    const strips = subdivideField(
      data.fieldId,
      geometry,
      data.count,
      data.baseName ?? "Paddock",
    );
    if (strips.length === 0) {
      return jsonError("Could not subdivide this field", 400);
    }

    const locationValues = strips.map((s) => ({
      id: nanoid(),
      orgId: org.id,
      userId: user.id,
      name: s.name,
      type: "paddock" as const,
      parentId: data.fieldId,
      geometry: JSON.stringify(s.geometry),
      zone: null,
    }));

    await db.insert(locations).values(locationValues);

    const paddockValues = locationValues.map((loc) => ({
      id: nanoid(),
      orgId: org.id,
      userId: user.id,
      locationId: loc.id,
      primaryForage: data.primaryForage ?? null,
      acres: null,
      restTargetDays: data.restTargetDays ?? null,
      startHeightIn: null,
      stopHeightIn: null,
      notes: null,
    }));

    await db.insert(paddocks).values(paddockValues);

    const createdIds = new Set(locationValues.map((l) => l.id));
    const locRows = await db.query.locations.findMany({
      where: eq(locations.orgId, org.id),
    });
    const createdLocations = locRows
      .filter((r) => createdIds.has(r.id))
      .map(serializeLocation);

    const padRows = await db.query.paddocks.findMany({
      where: eq(paddocks.orgId, org.id),
    });
    const createdPaddocks = padRows
      .filter((r) => createdIds.has(r.locationId))
      .map(serializePaddock);

    return NextResponse.json(
      {
        locations: createdLocations,
        paddocks: createdPaddocks,
        count: createdLocations.length,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to subdivide field", 500);
  }
}
