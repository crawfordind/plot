import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
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

export async function getOwnedHerd(id: string, userId: string) {
  return db.query.herds.findFirst({
    where: and(eq(herds.id, id), eq(herds.userId, userId)),
  });
}

export async function getOwnedPaddock(id: string, userId: string) {
  return db.query.paddocks.findFirst({
    where: and(eq(paddocks.id, id), eq(paddocks.userId, userId)),
  });
}

export async function getOwnedGrazingEvent(id: string, userId: string) {
  return db.query.grazingEvents.findFirst({
    where: and(eq(grazingEvents.id, id), eq(grazingEvents.userId, userId)),
  });
}

export async function getOwnedVariety(id: string, userId: string) {
  return db.query.varieties.findFirst({
    where: and(eq(varieties.id, id), eq(varieties.userId, userId)),
  });
}

export async function getOwnedCross(id: string, userId: string) {
  return db.query.crosses.findFirst({
    where: and(eq(crosses.id, id), eq(crosses.userId, userId)),
  });
}

export async function getOwnedSeason(id: string, userId: string) {
  return db.query.seasons.findFirst({
    where: and(eq(seasons.id, id), eq(seasons.userId, userId)),
  });
}
