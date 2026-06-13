import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { grazingEvents, herds } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { getOwnedHerd } from "@/lib/ownership";
import { serializeHerd } from "@/lib/serializers";
import { updateHerdSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const existing = await getOwnedHerd(id, org.id);
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

    const row = await getOwnedHerd(id, org.id);
    return NextResponse.json({ herd: serializeHerd(row!) });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update herd", 500);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const existing = await getOwnedHerd(id, org.id);
  if (!existing) return jsonError("Herd not found", 404);

  // Deleting a herd cascade-deletes its grazing_events — the NRCS 528 record of
  // every move this herd ever made. Refuse unless the caller has confirmed by
  // passing ?force=1, and report how many records would be lost so the UI can
  // warn the user before they destroy compliance history.
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force) {
    const history = await db.query.grazingEvents.findMany({
      where: and(
        eq(grazingEvents.herdId, id),
        eq(grazingEvents.orgId, org.id),
      ),
      columns: { id: true },
    });
    if (history.length > 0) {
      return NextResponse.json(
        {
          error: "confirm_required",
          grazingEventCount: history.length,
        },
        { status: 409 },
      );
    }
  }

  await db.delete(herds).where(eq(herds.id, id));
  return NextResponse.json({ ok: true });
}
