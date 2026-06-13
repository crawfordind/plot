import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { plantings } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import {
  getOwnedPlanting,
  getOwnedSeason,
  getOwnedVariety,
} from "@/lib/ownership";
import { serializePlanting } from "@/lib/serializers";
import { createPlantingSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");

  const rows = await db.query.plantings.findMany({
    where: locationId
      ? and(eq(plantings.orgId, org.id), eq(plantings.locationId, locationId))
      : eq(plantings.orgId, org.id),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return NextResponse.json({ plantings: rows.map(serializePlanting) });
}

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = createPlantingSchema.parse(body);

    // Validate FK references up front so a bad id returns 400, not a FK 500.
    if (data.varietyId && !(await getOwnedVariety(data.varietyId, org.id))) {
      return jsonError("Unknown variety", 400);
    }
    if (data.seasonId && !(await getOwnedSeason(data.seasonId, org.id))) {
      return jsonError("Unknown season", 400);
    }
    if (
      data.parentPlantingId &&
      !(await getOwnedPlanting(data.parentPlantingId, org.id))
    ) {
      return jsonError("Unknown parent planting", 400);
    }

    const id = nanoid();

    await db.insert(plantings).values({
      id,
      orgId: org.id,
      userId: user.id,
      locationId: data.locationId,
      varietyId: data.varietyId ?? null,
      plantType: data.plantType,
      commonName: data.commonName,
      variety: data.variety ?? null,
      source: data.source ?? null,
      seasonId: data.seasonId ?? null,
      parentPlantingId: data.parentPlantingId ?? null,
    });

    const row = await db.query.plantings.findFirst({
      where: eq(plantings.id, id),
    });

    return NextResponse.json({ planting: serializePlanting(row!) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
    }
    return NextResponse.json({ error: "Failed to create planting" }, { status: 500 });
  }
}
