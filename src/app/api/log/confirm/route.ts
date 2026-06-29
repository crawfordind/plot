import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { events, plantings, seasons, varieties } from "@/db/schema";
import { handleApiError, handleZodError, requireOrg } from "@/lib/api";
import { guessCropFamily } from "@/lib/crops/family";
import { confirmLogSchema } from "@/lib/parse/schema";
import { serializeEvent } from "@/lib/serializers";

const DAY_MS = 86_400_000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The org's current active season — the one whose window covers `at`, else the
// first active season. Used to attach a newly-created planting to a season
// without the farmer having to pick one.
async function currentSeasonId(
  tx: Tx,
  orgId: string,
  at: Date,
): Promise<string | null> {
  const rows = await tx.query.seasons.findMany({
    where: and(eq(seasons.orgId, orgId), eq(seasons.status, "active")),
  });
  const covering = rows.find((s) => s.startsAt <= at && at <= s.endsAt);
  return (covering ?? rows[0])?.id ?? null;
}

// Link a planting to a reusable variety row when an actual cultivar is named
// (find-or-create by name). We deliberately DON'T create a variety for a bare
// common name like "tomato" — that would pollute the seed library — so the
// caller only invokes this when `variety` is non-empty.
async function findOrCreateVariety(
  tx: Tx,
  orgId: string,
  userId: string,
  input: { name: string; plantType: "crop" | "flower" | "tree" | "breeding_line"; commonName: string },
): Promise<{ id: string; daysToMaturity: number | null; cropFamily: string | null }> {
  const norm = input.name.trim().toLowerCase();
  const existing = await tx.query.varieties.findMany({
    where: eq(varieties.orgId, orgId),
  });
  const hit = existing.find(
    (v) => v.name.trim().toLowerCase() === norm && v.plantType === input.plantType,
  );
  if (hit) {
    return { id: hit.id, daysToMaturity: hit.daysToMaturity, cropFamily: hit.cropFamily };
  }
  const id = nanoid();
  const cropFamily = guessCropFamily(input.commonName);
  await tx.insert(varieties).values({
    id,
    orgId,
    userId,
    name: input.name.trim(),
    plantType: input.plantType,
    cropFamily,
  });
  return { id, daysToMaturity: null, cropFamily };
}

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = confirmLogSchema.parse(body);

    const occurredAt = new Date(data.occurredAt);

    // Everything below is one transaction so a planting, its event, and any
    // lifecycle/status change land together or not at all — the route, not the
    // caller, owns planting lifecycle.
    const eventId = await db.transaction(async (tx) => {
      let plantingId = data.plantingId ?? null;

      if (data.createPlanting) {
        const cp = data.createPlanting;

        // Link a real cultivar to the seed library (and inherit its agronomy);
        // a bare common name stays varietyId-null but still gets a cropFamily.
        let varietyId: string | null = null;
        let dtm: number | null = null;
        let cropFamily = guessCropFamily(cp.commonName);
        if (cp.variety?.trim()) {
          const v = await findOrCreateVariety(tx, org.id, user.id, {
            name: cp.variety,
            plantType: cp.plantType,
            commonName: cp.commonName,
          });
          varietyId = v.id;
          dtm = v.daysToMaturity;
          if (v.cropFamily) cropFamily = v.cropFamily as typeof cropFamily;
        }

        // The maturity clock anchors on the event that created the planting.
        const sownAt = data.type === "sow" ? occurredAt : null;
        const transplantedAt = data.type === "transplant" ? occurredAt : null;
        const anchor = sownAt ?? transplantedAt;
        const expectedHarvestAt =
          anchor && dtm ? new Date(anchor.getTime() + dtm * DAY_MS) : null;

        const newPlantingId = nanoid();
        await tx.insert(plantings).values({
          id: newPlantingId,
          orgId: org.id,
          userId: user.id,
          locationId: cp.locationId,
          varietyId,
          plantType: cp.plantType,
          commonName: cp.commonName,
          variety: cp.variety ?? null,
          seasonId: data.seasonId ?? (await currentSeasonId(tx, org.id, occurredAt)),
          sownAt,
          transplantedAt,
          expectedHarvestAt,
          daysToMaturity: dtm,
          cropFamily,
        });
        plantingId = newPlantingId;
      } else if (
        plantingId &&
        (data.type === "sow" || data.type === "transplant")
      ) {
        // A sow/transplant logged against an EXISTING planting backfills its
        // lifecycle date (and expected harvest) when not already set — so a
        // belated "sowed the chard 3 weeks ago" still records the real date.
        const p = await tx.query.plantings.findFirst({
          where: eq(plantings.id, plantingId),
        });
        if (p) {
          const patch: Partial<typeof plantings.$inferInsert> = {};
          if (data.type === "sow" && !p.sownAt) patch.sownAt = occurredAt;
          if (data.type === "transplant" && !p.transplantedAt) {
            patch.transplantedAt = occurredAt;
          }
          const anchor =
            patch.sownAt ?? p.sownAt ?? patch.transplantedAt ?? p.transplantedAt;
          if (!p.expectedHarvestAt && anchor && p.daysToMaturity) {
            patch.expectedHarvestAt = new Date(
              anchor.getTime() + p.daysToMaturity * DAY_MS,
            );
          }
          if (Object.keys(patch).length > 0) {
            await tx.update(plantings).set(patch).where(eq(plantings.id, plantingId));
          }
        }
      }

      const id = nanoid();
      await tx.insert(events).values({
        id,
        orgId: org.id,
        userId: user.id,
        plantingId,
        locationId: data.locationId ?? null,
        type: data.type,
        occurredAt,
        quantity: data.quantity ?? null,
        unit: data.unit ?? null,
        amount: data.amount ?? null,
        notes: data.notes ?? null,
        rawText: data.rawText,
        parsedJson: JSON.stringify(data.parsedJson),
      });

      // A terminal harvest (or any seed-save) closes out the planting so it
      // stops showing as active and the coach stops nudging it.
      const isTerminal =
        plantingId != null &&
        ((data.type === "harvest" && data.isFinal === true) ||
          data.type === "seed_save");
      if (isTerminal && plantingId) {
        await tx
          .update(plantings)
          .set({ status: "harvested", closedAt: occurredAt })
          .where(eq(plantings.id, plantingId));
      }

      return id;
    });

    const row = await db.query.events.findFirst({
      where: eq(events.id, eventId),
    });

    return NextResponse.json({ event: serializeEvent(row!) }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
    }
    return handleApiError(error, "save log");
  }
}
