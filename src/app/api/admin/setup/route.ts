import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { client, db } from "@/db";
import { MIGRATION_STATEMENTS } from "@/db/migrations-sql";
import { users } from "@/db/schema";
import { createUser } from "@/lib/auth";

// One-time bootstrap to create the schema and seed the dev user on a freshly
// provisioned database (e.g. a new Turso DB that has never had migrations run).
// It uses the DB credentials already present in the deployment's environment, so
// it can fix production without anyone needing the Turso token locally.
//
// Guarded by SETUP_SECRET: the endpoint is disabled unless that env var is set,
// and the caller must pass a matching `?key=`. Remove SETUP_SECRET (or this
// route) once the database is provisioned.
//
// Usage: GET /api/admin/setup?key=<SETUP_SECRET>

export const dynamic = "force-dynamic";

const DEV_EMAIL = "daniel@runamuckfarmspa.com";
const DEV_NAME = "Daniel";
const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD ?? "plotdev";

async function tableExists(name: string): Promise<boolean> {
  const res = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [name],
  });
  return res.rows.length > 0;
}

export async function GET(request: Request) {
  const secret = process.env.SETUP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Setup is disabled. Set SETUP_SECRET in the environment to enable it." },
      { status: 403 },
    );
  }

  const key = new URL(request.url).searchParams.get("key");
  if (key !== secret) {
    return NextResponse.json({ error: "Invalid or missing key" }, { status: 403 });
  }

  try {
    const alreadyProvisioned = await tableExists("users");

    let applied = 0;
    if (!alreadyProvisioned) {
      // Fresh DB: run the embedded migration DDL in order.
      for (const stmt of MIGRATION_STATEMENTS) {
        try {
          await client.execute(stmt);
          applied += 1;
        } catch (error) {
          // Tolerate "already exists" so a re-run after a partial apply is safe;
          // anything else is a real failure worth surfacing.
          const message = error instanceof Error ? error.message : String(error);
          if (!/already exists/i.test(message)) throw error;
        }
      }
    }

    // Seed the dev user if missing (createUser also gives them an org + owner
    // membership, matching the real signup flow).
    const existing = await db.query.users.findFirst({
      where: eq(users.email, DEV_EMAIL),
    });
    let seeded = false;
    if (!existing) {
      await createUser(DEV_EMAIL, DEV_PASSWORD, DEV_NAME);
      seeded = true;
    }

    return NextResponse.json({
      ok: true,
      schema: alreadyProvisioned ? "already present" : `applied ${applied} statements`,
      devUser: seeded ? `seeded ${DEV_EMAIL}` : "already exists",
    });
  } catch (error) {
    console.error("GET /api/admin/setup failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
