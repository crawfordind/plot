import "dotenv/config";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth";

const DEV_EMAIL = "daniel@runamuckfarmspa.com";
const DEV_NAME = "Daniel";
const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? "plotdev";

async function seed() {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, DEV_EMAIL),
  });

  if (existing) {
    console.log(`User already exists: ${DEV_EMAIL}`);
    return;
  }

  const passwordHash = await hashPassword(DEV_PASSWORD);

  await db.insert(users).values({
    id: nanoid(),
    email: DEV_EMAIL,
    name: DEV_NAME,
    passwordHash,
  });

  console.log(`Seeded dev user: ${DEV_EMAIL}`);
  console.log(`Password: ${DEV_PASSWORD}`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
