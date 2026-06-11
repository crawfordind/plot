import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { varieties } from "@/db/schema";
import { handleZodError, jsonError, requireUser } from "@/lib/api";
import { getOwnedVariety } from "@/lib/ownership";
import { serializeVariety } from "@/lib/serializers";
import { updateVarietySchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedVariety(id, user.id);
  if (!existing) return jsonError("Variety not found", 404);

  try {
    const body = await request.json();
    const data = updateVarietySchema.parse(body);

    await db
      .update(varieties)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.plantType !== undefined ? { plantType: data.plantType } : {}),
        ...(data.lineageParentIds !== undefined
          ? {
              lineageParentIds: data.lineageParentIds
                ? JSON.stringify(data.lineageParentIds)
                : null,
            }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      })
      .where(eq(varieties.id, id));

    const row = await getOwnedVariety(id, user.id);
    return NextResponse.json({ variety: serializeVariety(row!) });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update variety", 500);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedVariety(id, user.id);
  if (!existing) return jsonError("Variety not found", 404);

  await db.delete(varieties).where(eq(varieties.id, id));
  return NextResponse.json({ ok: true });
}
