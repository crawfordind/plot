import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { herds } from "@/db/schema";
import { handleZodError, jsonError, requireUser } from "@/lib/api";
import { serializeHerd } from "@/lib/serializers";
import { createHerdSchema } from "@/lib/validators";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const rows = await db.query.herds.findMany({
    where: eq(herds.userId, user.id),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  return NextResponse.json({ herds: rows.map(serializeHerd) });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  try {
    const body = await request.json();
    const data = createHerdSchema.parse(body);

    const id = nanoid();
    await db.insert(herds).values({
      id,
      userId: user.id,
      name: data.name,
      species: data.species,
      headCount: data.headCount,
      avgWeightLb: data.avgWeightLb,
      dmIntakePct: data.dmIntakePct ?? null,
      notes: data.notes ?? null,
    });

    const row = await db.query.herds.findFirst({ where: eq(herds.id, id) });
    return NextResponse.json({ herd: serializeHerd(row!) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to create herd", 500);
  }
}
