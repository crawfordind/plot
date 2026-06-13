import "dotenv/config";
import { execSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { createUser } from "../src/lib/auth";

// One command to bring a database up to date and ensure the dev user exists.
// - `drizzle-kit push` diffs the schema in src/db/schema.ts against the target
//   database and applies any changes. On a fresh DB this creates every table;
//   on later runs it's a no-op when nothing changed. Honors TURSO_DATABASE_URL
//   / TURSO_AUTH_TOKEN from .env via drizzle.config.ts.
// - Seeds the dev account on first run via createUser, which also gives them a
//   personal organization + owner membership (the same path real signups take),
//   so the seeded user can actually use the app.
// Safe to run repeatedly.

const DEV_EMAIL = "daniel@runamuckfarmspa.com";
const DEV_NAME = "Daniel";
const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? "plotdev";

async function setup() {
  console.log("Syncing schema (drizzle-kit push)…");
  execSync("drizzle-kit push --force", { stdio: "inherit" });
  console.log("Schema up to date.");

  const existing = await db.query.users.findFirst({
    where: eq(users.email, DEV_EMAIL),
  });

  if (existing) {
    console.log(`Dev user already exists: ${DEV_EMAIL}`);
    return;
  }

  await createUser(DEV_EMAIL, DEV_PASSWORD, DEV_NAME);
  console.log(`Seeded dev user: ${DEV_EMAIL}`);
  console.log(`Password: ${DEV_PASSWORD}`);
}

setup()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
