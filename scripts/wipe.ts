import "dotenv/config";
import { db } from "../src/db";
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
} from "../src/db/schema";

// Deletes ALL farm/domain data while keeping users + sessions (so you stay
// logged in). Order matters: clear child/dependent tables before their parents
// even though FKs cascade, so this is safe regardless of cascade support.
async function wipe() {
  await db.delete(grazingEvents);
  await db.delete(paddocks);
  await db.delete(herds);
  await db.delete(events);
  await db.delete(crosses);
  await db.delete(plantings);
  await db.delete(seasons);
  await db.delete(varieties);
  await db.delete(locations);

  console.log("Wiped all farm data (locations, plantings, events, herds,");
  console.log("paddocks, grazing events, varieties, crosses, seasons).");
  console.log("Users and sessions were kept — you stay logged in.");
}

wipe()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
