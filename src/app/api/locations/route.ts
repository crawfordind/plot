import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { handleApiError, handleZodError, requireOrg } from "@/lib/api";
import { serializeLocation } from "@/lib/serializers";
import { createLocationSchema } from "@/lib/validators";

export async function GET() {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const rows = await db.query.locations.findMany({
    where: eq(locations.orgId, org.id),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return NextResponse.json({ locations: rows.map(serializeLocation) });
}

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = createLocationSchema.parse(body);
    const id = nanoid();

    await db.insert(locations).values({
      id,
      orgId: org.id,
      userId: user.id,
      name: data.name,
      type: data.type,
      parentId: data.parentId ?? null,
      geometry: JSON.stringify(data.geometry),
      zone: data.zone ?? null,
    });

    const row = await db.query.locations.findFirst({
      where: eq(locations.id, id),
    });

    return NextResponse.json({ location: serializeLocation(row!) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
    }
    return handleApiError(error, "create location");
  }
}
