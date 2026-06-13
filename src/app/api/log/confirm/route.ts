import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { events, plantings } from "@/db/schema";
import { handleZodError, requireOrg } from "@/lib/api";
import { confirmLogSchema } from "@/lib/parse/schema";
import { serializeEvent } from "@/lib/serializers";

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = confirmLogSchema.parse(body);

    let plantingId = data.plantingId ?? null;

    if (data.createPlanting) {
      const newPlantingId = nanoid();
      await db.insert(plantings).values({
        id: newPlantingId,
        orgId: org.id,
        userId: user.id,
        locationId: data.createPlanting.locationId,
        plantType: data.createPlanting.plantType,
        commonName: data.createPlanting.commonName,
        variety: data.createPlanting.variety ?? null,
      });
      plantingId = newPlantingId;
    }

    const eventId = nanoid();

    await db.insert(events).values({
      id: eventId,
      orgId: org.id,
      userId: user.id,
      plantingId,
      locationId: data.locationId ?? null,
      type: data.type,
      occurredAt: new Date(data.occurredAt),
      quantity: data.quantity ?? null,
      unit: data.unit ?? null,
      amount: data.amount ?? null,
      notes: data.notes ?? null,
      rawText: data.rawText,
      parsedJson: JSON.stringify(data.parsedJson),
    });

    const row = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });

    return NextResponse.json({ event: serializeEvent(row!) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
    }
    return NextResponse.json({ error: "Failed to save log" }, { status: 500 });
  }
}
