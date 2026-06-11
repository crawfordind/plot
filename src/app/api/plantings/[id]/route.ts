import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { plantings } from "@/db/schema";
import { handleZodError, jsonError, requireUser } from "@/lib/api";
import { getOwnedPlanting } from "@/lib/ownership";
import { serializePlanting } from "@/lib/serializers";
import { updatePlantingSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const row = await getOwnedPlanting(id, user.id);
  if (!row) return jsonError("Planting not found", 404);

  return NextResponse.json({ planting: serializePlanting(row) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedPlanting(id, user.id);
  if (!existing) return jsonError("Planting not found", 404);

  try {
    const body = await request.json();
    const data = updatePlantingSchema.parse(body);

    await db
      .update(plantings)
      .set({
        ...(data.locationId !== undefined ? { locationId: data.locationId } : {}),
        ...(data.plantType !== undefined ? { plantType: data.plantType } : {}),
        ...(data.commonName !== undefined ? { commonName: data.commonName } : {}),
        ...(data.variety !== undefined ? { variety: data.variety ?? null } : {}),
        ...(data.varietyId !== undefined
          ? { varietyId: data.varietyId ?? null }
          : {}),
        ...(data.source !== undefined ? { source: data.source ?? null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.seasonId !== undefined ? { seasonId: data.seasonId ?? null } : {}),
        ...(data.parentPlantingId !== undefined
          ? { parentPlantingId: data.parentPlantingId ?? null }
          : {}),
      })
      .where(eq(plantings.id, id));

    const row = await getOwnedPlanting(id, user.id);
    return NextResponse.json({ planting: serializePlanting(row!) });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update planting", 500);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedPlanting(id, user.id);
  if (!existing) return jsonError("Planting not found", 404);

  await db.delete(plantings).where(eq(plantings.id, id));
  return NextResponse.json({ ok: true });
}
