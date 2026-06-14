import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { paddocks } from "@/db/schema";
import { handleApiError, handleZodError, jsonError, requireOrg } from "@/lib/api";
import { getOwnedLocation } from "@/lib/ownership";
import { serializePaddock } from "@/lib/serializers";
import { createPaddockSchema } from "@/lib/validators";

export async function GET() {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const rows = await db.query.paddocks.findMany({
    where: eq(paddocks.orgId, org.id),
  });
  return NextResponse.json({ paddocks: rows.map(serializePaddock) });
}

// Upsert grazing config for a location (one config per paddock location).
export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = createPaddockSchema.parse(body);

    const location = await getOwnedLocation(data.locationId, org.id);
    if (!location) return jsonError("Location not found", 404);

    const fields = {
      primaryForage: data.primaryForage ?? null,
      acres: data.acres ?? null,
      restTargetDays: data.restTargetDays ?? null,
      startHeightIn: data.startHeightIn ?? null,
      stopHeightIn: data.stopHeightIn ?? null,
      notes: data.notes ?? null,
    };

    const existing = await db.query.paddocks.findFirst({
      where: and(
        eq(paddocks.locationId, data.locationId),
        eq(paddocks.orgId, org.id),
      ),
    });

    let id: string;
    if (existing) {
      id = existing.id;
      await db.update(paddocks).set(fields).where(eq(paddocks.id, id));
    } else {
      id = nanoid();
      await db.insert(paddocks).values({
        id,
        orgId: org.id,
        userId: user.id,
        locationId: data.locationId,
        ...fields,
      });
    }

    const row = await db.query.paddocks.findFirst({ where: eq(paddocks.id, id) });
    return NextResponse.json(
      { paddock: serializePaddock(row!) },
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return handleApiError(error, "save paddock");
  }
}
