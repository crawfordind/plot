import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@libsql/client";
import { nanoid } from "nanoid";

const DATA_TABLES = [
  "locations",
  "plantings",
  "events",
  "herds",
  "paddocks",
  "grazing_events",
  "varieties",
  "crosses",
  "seasons",
  "attachments",
];

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  const hasColumn = async (table: string, col: string) => {
    const info = await client.execute(`PRAGMA table_info(${table});`);
    return info.rows.some((r) => r.name === col);
  };
  const addColumn = async (table: string, col: string, decl: string) => {
    if (!(await hasColumn(table, col))) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl};`);
      console.log(`+ ${table}.${col}`);
    }
  };

  // 1. New tables.
  await client.execute(`CREATE TABLE IF NOT EXISTS organizations (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at integer NOT NULL DEFAULT (unixepoch() * 1000)
  );`);
  await client.execute(`CREATE TABLE IF NOT EXISTS memberships (
    id text PRIMARY KEY NOT NULL,
    org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member',
    created_at integer NOT NULL DEFAULT (unixepoch() * 1000)
  );`);
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS memberships_org_user_idx ON memberships(org_id, user_id);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON memberships(user_id);`);
  await client.execute(`CREATE TABLE IF NOT EXISTS org_invites (
    id text PRIMARY KEY NOT NULL,
    org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    invited_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    token text NOT NULL UNIQUE,
    created_at integer NOT NULL DEFAULT (unixepoch() * 1000),
    accepted_at integer
  );`);
  await client.execute(`CREATE INDEX IF NOT EXISTS org_invites_email_idx ON org_invites(email);`);
  await client.execute(`CREATE INDEX IF NOT EXISTS org_invites_org_id_idx ON org_invites(org_id);`);

  // 2. New columns.
  await addColumn("sessions", "active_org_id", "text REFERENCES organizations(id) ON DELETE SET NULL");
  for (const t of DATA_TABLES) {
    await addColumn(t, "org_id", "text REFERENCES organizations(id) ON DELETE CASCADE");
    await client.execute(`CREATE INDEX IF NOT EXISTS ${t}_org_id_idx ON ${t}(org_id);`);
  }

  // 3. Backfill: a personal org per existing user, owning all their rows.
  const users = await client.execute(`SELECT id, email, name FROM users;`);
  for (const u of users.rows) {
    const userId = u.id as string;
    // Skip if this user already owns an org (idempotent re-run).
    const existing = await client.execute({
      sql: `SELECT org_id FROM memberships WHERE user_id = ? AND role = 'owner' LIMIT 1;`,
      args: [userId],
    });
    let orgId: string;
    if (existing.rows.length > 0) {
      orgId = existing.rows[0].org_id as string;
    } else {
      orgId = nanoid();
      const label = (u.name as string) || ((u.email as string)?.split("@")[0]) || "My";
      await client.execute({
        sql: `INSERT INTO organizations (id, name, created_by_user_id) VALUES (?, ?, ?);`,
        args: [orgId, `${label}'s Farm`, userId],
      });
      await client.execute({
        sql: `INSERT INTO memberships (id, org_id, user_id, role) VALUES (?, ?, ?, 'owner');`,
        args: [nanoid(), orgId, userId],
      });
      console.log(`org for ${u.email}: ${orgId}`);
    }
    for (const t of DATA_TABLES) {
      await client.execute({
        sql: `UPDATE ${t} SET org_id = ? WHERE user_id = ? AND org_id IS NULL;`,
        args: [orgId, userId],
      });
    }
    await client.execute({
      sql: `UPDATE sessions SET active_org_id = ? WHERE user_id = ? AND active_org_id IS NULL;`,
      args: [orgId, userId],
    });
  }

  // Report any rows that still lack an org (should be zero).
  for (const t of DATA_TABLES) {
    const r = await client.execute(`SELECT COUNT(*) AS c FROM ${t} WHERE org_id IS NULL;`);
    const c = Number(r.rows[0].c);
    if (c > 0) console.log(`WARNING: ${t} has ${c} rows with no org`);
  }
  console.log("migration complete");
}
main();
