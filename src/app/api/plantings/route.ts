import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { plantings } from "@/db/schema";
import { handleZodError, requireUser } from "@/lib/api";
import { serializePlanting } from "@/lib/serializers";
import { createPlantingSchema } from "@/lib/validators";

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");

  const rows = await db.query.plantings.findMany({
    where: locationId
      ? and(eq(plantings.userId, user.id), eq(plantings.locationId, locationId))
      : eq(plantings.userId, user.id),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return NextResponse.json({ plantings: rows.map(serializePlanting) });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  try {
    const body = await request.json();
    const data = createPlantingSchema.parse(body);
    const id = nanoid();

    await db.insert(plantings).values({
      id,
      userId: user.id,
      locationId: data.locationId,
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
