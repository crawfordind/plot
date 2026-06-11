import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { seasons } from "@/db/schema";
import { handleZodError, jsonError, requireUser } from "@/lib/api";
import { getOwnedLocation } from "@/lib/ownership";
import { serializeSeason } from "@/lib/serializers";
import { createSeasonSchema } from "@/lib/validators";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const rows = await db.query.seasons.findMany({
    where: eq(seasons.userId, user.id),
    orderBy: (table, { desc }) => [desc(table.startsAt)],
  });
  return NextResponse.json({ seasons: rows.map(serializeSeason) });
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  try {
    const body = await request.json();
    const data = createSeasonSchema.parse(body);

    if (data.locationId && !(await getOwnedLocation(data.locationId, user.id))) {
      return jsonError("Unknown location", 400);
    }

    const id = nanoid();
    await db.insert(seasons).values({
      id,
      userId: user.id,
      locationId: data.locationId ?? null,
      label: data.label,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
    });

    const row = await db.query.seasons.findFirst({ where: eq(seasons.id, id) });
    return NextResponse.json({ season: serializeSeason(row!) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to create season", 500);
  }
}
