import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { varieties } from "@/db/schema";
import { handleApiError, handleZodError, requireOrg } from "@/lib/api";
import { serializeVariety } from "@/lib/serializers";
import { createVarietySchema } from "@/lib/validators";

export async function GET() {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const rows = await db.query.varieties.findMany({
    where: eq(varieties.orgId, org.id),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  return NextResponse.json({ varieties: rows.map(serializeVariety) });
}

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = createVarietySchema.parse(body);
    const id = nanoid();

    await db.insert(varieties).values({
      id,
      orgId: org.id,
      userId: user.id,
      name: data.name,
      plantType: data.plantType,
      lineageParentIds: data.lineageParentIds
        ? JSON.stringify(data.lineageParentIds)
        : null,
      notes: data.notes ?? null,
    });

    const row = await db.query.varieties.findFirst({ where: eq(varieties.id, id) });
    return NextResponse.json({ variety: serializeVariety(row!) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return handleApiError(error, "create variety");
  }
}
