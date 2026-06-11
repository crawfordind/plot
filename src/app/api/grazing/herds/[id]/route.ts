import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { herds } from "@/db/schema";
import { handleZodError, jsonError, requireUser } from "@/lib/api";
import { getOwnedHerd } from "@/lib/ownership";
import { serializeHerd } from "@/lib/serializers";
import { updateHerdSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedHerd(id, user.id);
  if (!existing) return jsonError("Herd not found", 404);

  try {
    const body = await request.json();
    const data = updateHerdSchema.parse(body);

    await db
      .update(herds)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.species !== undefined ? { species: data.species } : {}),
        ...(data.headCount !== undefined ? { headCount: data.headCount } : {}),
        ...(data.avgWeightLb !== undefined
          ? { avgWeightLb: data.avgWeightLb }
          : {}),
        ...(data.dmIntakePct !== undefined
          ? { dmIntakePct: data.dmIntakePct ?? null }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      })
      .where(eq(herds.id, id));

    const row = await getOwnedHerd(id, user.id);
    return NextResponse.json({ herd: serializeHerd(row!) });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update herd", 500);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const { id } = await params;
  const existing = await getOwnedHerd(id, user.id);
  if (!existing) return jsonError("Herd not found", 404);

  await db.delete(herds).where(eq(herds.id, id));
  return NextResponse.json({ ok: true });
}
