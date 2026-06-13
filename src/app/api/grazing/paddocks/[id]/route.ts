import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { paddocks } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { getOwnedPaddock } from "@/lib/ownership";
import { serializePaddock } from "@/lib/serializers";
import { updatePaddockSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const existing = await getOwnedPaddock(id, org.id);
  if (!existing) return jsonError("Paddock not found", 404);

  try {
    const body = await request.json();
    const data = updatePaddockSchema.parse(body);

    await db
      .update(paddocks)
      .set({
        ...(data.primaryForage !== undefined
          ? { primaryForage: data.primaryForage ?? null }
          : {}),
        ...(data.acres !== undefined ? { acres: data.acres ?? null } : {}),
        ...(data.restTargetDays !== undefined
          ? { restTargetDays: data.restTargetDays ?? null }
          : {}),
        ...(data.startHeightIn !== undefined
          ? { startHeightIn: data.startHeightIn ?? null }
          : {}),
        ...(data.stopHeightIn !== undefined
          ? { stopHeightIn: data.stopHeightIn ?? null }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes ?? null } : {}),
      })
      .where(eq(paddocks.id, id));

    const row = await getOwnedPaddock(id, org.id);
    return NextResponse.json({ paddock: serializePaddock(row!) });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update paddock", 500);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const existing = await getOwnedPaddock(id, org.id);
  if (!existing) return jsonError("Paddock not found", 404);

  await db.delete(paddocks).where(eq(paddocks.id, id));
  return NextResponse.json({ ok: true });
}
