import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { events, plantings } from "@/db/schema";
import { handleApiError, handleZodError, requireOrg } from "@/lib/api";
import { confirmLogBatchSchema } from "@/lib/parse/schema";
import { serializeEvent } from "@/lib/serializers";

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = confirmLogBatchSchema.parse(body);
    const saved = [];

    for (const entry of data.entries) {
      let plantingId = entry.plantingId ?? null;

      if (entry.createPlanting) {
        const newPlantingId = nanoid();
        await db.insert(plantings).values({
          id: newPlantingId,
          orgId: org.id,
          userId: user.id,
          locationId: entry.createPlanting.locationId,
          plantType: entry.createPlanting.plantType,
          commonName: entry.createPlanting.commonName,
          variety: entry.createPlanting.variety ?? null,
        });
        plantingId = newPlantingId;
      }

      const eventId = nanoid();
      await db.insert(events).values({
        id: eventId,
        orgId: org.id,
        userId: user.id,
        plantingId,
        locationId: entry.locationId ?? null,
        type: entry.type,
        occurredAt: new Date(entry.occurredAt),
        quantity: entry.quantity ?? null,
        unit: entry.unit ?? null,
        amount: entry.amount ?? null,
        notes: entry.notes ?? null,
        rawText: entry.rawText,
        parsedJson: JSON.stringify(entry.parsedJson),
      });

      const row = await db.query.events.findFirst({
        where: eq(events.id, eventId),
      });
      saved.push(serializeEvent(row!));
    }

    return NextResponse.json({ events: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
    }
    return handleApiError(error, "save logs");
  }
}
