import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  crosses,
  events,
  grazingEvents,
  herds,
  locations,
  paddocks,
  plantings,
  seasons,
  varieties,
} from "@/db/schema";

// All ownership is scoped to the active ORGANIZATION (workspace): any member of
// the org may read/edit the org's rows. Pass the caller's active org id.

export async function getOwnedAttachment(id: string, orgId: string) {
  return db.query.attachments.findFirst({
    where: and(eq(attachments.id, id), eq(attachments.orgId, orgId)),
  });
}

export async function getOwnedLocation(id: string, orgId: string) {
  return db.query.locations.findFirst({
    where: and(eq(locations.id, id), eq(locations.orgId, orgId)),
  });
}

export async function getOwnedPlanting(id: string, orgId: string) {
  return db.query.plantings.findFirst({
    where: and(eq(plantings.id, id), eq(plantings.orgId, orgId)),
  });
}

export async function getOwnedEvent(id: string, orgId: string) {
  return db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.orgId, orgId)),
  });
}

export async function getOwnedHerd(id: string, orgId: string) {
  return db.query.herds.findFirst({
    where: and(eq(herds.id, id), eq(herds.orgId, orgId)),
  });
}

export async function getOwnedPaddock(id: string, orgId: string) {
  return db.query.paddocks.findFirst({
    where: and(eq(paddocks.id, id), eq(paddocks.orgId, orgId)),
  });
}

export async function getOwnedGrazingEvent(id: string, orgId: string) {
  return db.query.grazingEvents.findFirst({
    where: and(eq(grazingEvents.id, id), eq(grazingEvents.orgId, orgId)),
  });
}

export async function getOwnedVariety(id: string, orgId: string) {
  return db.query.varieties.findFirst({
    where: and(eq(varieties.id, id), eq(varieties.orgId, orgId)),
  });
}

export async function getOwnedCross(id: string, orgId: string) {
  return db.query.crosses.findFirst({
    where: and(eq(crosses.id, id), eq(crosses.orgId, orgId)),
  });
}

export async function getOwnedSeason(id: string, orgId: string) {
  return db.query.seasons.findFirst({
    where: and(eq(seasons.id, id), eq(seasons.orgId, orgId)),
  });
}

// Validates that each provided foreign-key reference belongs to the org. Returns
// the name of the first unowned/missing reference, or null if all good (or
// absent). Stops a caller attaching an event/planting to another org's row.
export async function findUnownedRef(
  orgId: string,
  refs: Partial<{
    locationId: string | null;
    plantingId: string | null;
    varietyId: string | null;
    seasonId: string | null;
    parentPlantingId: string | null;
  }>,
): Promise<string | null> {
  if (refs.locationId && !(await getOwnedLocation(refs.locationId, orgId)))
    return "locationId";
  if (refs.plantingId && !(await getOwnedPlanting(refs.plantingId, orgId)))
    return "plantingId";
  if (refs.varietyId && !(await getOwnedVariety(refs.varietyId, orgId)))
    return "varietyId";
  if (refs.seasonId && !(await getOwnedSeason(refs.seasonId, orgId)))
    return "seasonId";
  if (
    refs.parentPlantingId &&
    !(await getOwnedPlanting(refs.parentPlantingId, orgId))
  )
    return "parentPlantingId";
  return null;
}
