import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { crosses } from "@/db/schema";
import { handleApiError, handleZodError, jsonError, requireOrg } from "@/lib/api";
import { getOwnedPlanting } from "@/lib/ownership";
import { serializeCross } from "@/lib/serializers";
import { createCrossSchema } from "@/lib/validators";

export async function GET() {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const rows = await db.query.crosses.findMany({
    where: eq(crosses.orgId, org.id),
    orderBy: (table, { desc }) => [desc(table.occurredAt)],
  });
  return NextResponse.json({ crosses: rows.map(serializeCross) });
}

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = createCrossSchema.parse(body);

    const [mother, father] = await Promise.all([
      getOwnedPlanting(data.motherPlantingId, org.id),
      getOwnedPlanting(data.fatherPlantingId, org.id),
    ]);
    if (!mother) return jsonError("Unknown mother planting", 400);
    if (!father) return jsonError("Unknown father planting", 400);
    if (
      data.resultLineId &&
      !(await getOwnedPlanting(data.resultLineId, org.id))
    ) {
      return jsonError("Unknown result line", 400);
    }

    const id = nanoid();
    await db.insert(crosses).values({
      id,
      orgId: org.id,
      userId: user.id,
      motherPlantingId: data.motherPlantingId,
      fatherPlantingId: data.fatherPlantingId,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
      resultLineId: data.resultLineId ?? null,
      notes: data.notes ?? null,
    });

    const row = await db.query.crosses.findFirst({ where: eq(crosses.id, id) });
    return NextResponse.json({ cross: serializeCross(row!) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return handleApiError(error, "record cross");
  }
}
