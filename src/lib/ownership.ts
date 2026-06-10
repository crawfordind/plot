import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, locations, plantings } from "@/db/schema";

export async function getOwnedLocation(id: string, userId: string) {
  return db.query.locations.findFirst({
    where: and(eq(locations.id, id), eq(locations.userId, userId)),
  });
}

export async function getOwnedPlanting(id: string, userId: string) {
  return db.query.plantings.findFirst({
    where: and(eq(plantings.id, id), eq(plantings.userId, userId)),
  });
}

export async function getOwnedEvent(id: string, userId: string) {
  return db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, userId)),
  });
}
