import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { seasons } from "@/db/schema";
import { handleZodError, jsonError, requireUser } from "@/lib/api";
import { getOwnedSeason } from "@/lib/ownership";
import { serializeSeason } from "@/lib/serializers";
import { updateSeasonSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedSeason(id, user.id);
  if (!existing) return jsonError("Season not found", 404);

  try {
    const body = await request.json();
    const data = updateSeasonSchema.parse(body);

    await db
      .update(seasons)
      .set({
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.locationId !== undefined
          ? { locationId: data.locationId ?? null }
          : {}),
        ...(data.startsAt !== undefined ? { startsAt: new Date(data.startsAt) } : {}),
        ...(data.endsAt !== undefined ? { endsAt: new Date(data.endsAt) } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.reviewSummary !== undefined
          ? { reviewSummary: data.reviewSummary ?? null }
          : {}),
      })
      .where(eq(seasons.id, id));

    const row = await getOwnedSeason(id, user.id);
    return NextResponse.json({ season: serializeSeason(row!) });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update season", 500);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedSeason(id, user.id);
  if (!existing) return jsonError("Season not found", 404);

  await db.delete(seasons).where(eq(seasons.id, id));
  return NextResponse.json({ ok: true });
}
