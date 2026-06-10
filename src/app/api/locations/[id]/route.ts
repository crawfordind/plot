import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { handleZodError, jsonError, requireUser } from "@/lib/api";
import { getOwnedLocation } from "@/lib/ownership";
import { serializeLocation } from "@/lib/serializers";
import { updateLocationSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const row = await getOwnedLocation(id, user.id);
  if (!row) return jsonError("Location not found", 404);

  return NextResponse.json({ location: serializeLocation(row) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedLocation(id, user.id);
  if (!existing) return jsonError("Location not found", 404);

  try {
    const body = await request.json();
    const data = updateLocationSchema.parse(body);

    await db
      .update(locations)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.geometry !== undefined
          ? { geometry: JSON.stringify(data.geometry) }
          : {}),
        ...(data.zone !== undefined ? { zone: data.zone ?? null } : {}),
      })
      .where(eq(locations.id, id));

    const row = await getOwnedLocation(id, user.id);
    return NextResponse.json({ location: serializeLocation(row!) });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update location", 500);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedLocation(id, user.id);
  if (!existing) return jsonError("Location not found", 404);

  await db.delete(locations).where(eq(locations.id, id));
  return NextResponse.json({ ok: true });
}
