import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { memberships, orgInvites, organizations, sessions, users } from "@/db/schema";
import type { OrgRole } from "@/lib/types";

const SESSION_COOKIE = "plot_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// Accept any pending email-invites for this user, creating memberships. Called on
// register + login so an invited person joins their team automatically.
export async function acceptPendingInvites(userId: string, email: string) {
  const pending = await db.query.orgInvites.findMany({
    where: and(eq(orgInvites.email, email.toLowerCase()), isNull(orgInvites.acceptedAt)),
  });
  for (const invite of pending) {
    const already = await db.query.memberships.findFirst({
      where: and(eq(memberships.orgId, invite.orgId), eq(memberships.userId, userId)),
    });
    if (!already) {
      await db.insert(memberships).values({
        id: nanoid(),
        orgId: invite.orgId,
        userId,
        role: invite.role,
      });
    }
    await db
      .update(orgInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(orgInvites.id, invite.id));
  }
}

// Create a user, give them a personal organization (their default workspace),
// and pull in any pending invites. Returns the user + the org they should land in.
export async function createUser(email: string, password: string, name?: string) {
  const normalized = email.toLowerCase();
  const existing = await db.query.users.findFirst({
    where: eq(users.email, normalized),
  });
  if (existing) {
    throw new Error("Email already registered");
  }

  const id = nanoid();
  // passwordHash is the only credential today; magic-link tokens can be added
  // later without touching this flow (sessions are credential-agnostic).
  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ id, email: normalized, name: name ?? null, passwordHash });

  const orgId = nanoid();
  const label = name?.trim() || normalized.split("@")[0] || "My";
  await db.insert(organizations).values({
    id: orgId,
    name: `${label}'s Farm`,
    createdByUserId: id,
  });
  await db.insert(memberships).values({
    id: nanoid(),
    orgId,
    userId: id,
    role: "owner",
  });

  await acceptPendingInvites(id, normalized);

  return { id, email: normalized, name: name ?? null, orgId };
}

export async function authenticateUser(email: string, password: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return null;
  }
  return { id: user.id, email: user.email, name: user.name };
}

// The orgs a user belongs to, with their role, newest membership last.
export async function getMembershipsForUser(userId: string) {
  const rows = await db.query.memberships.findMany({
    where: eq(memberships.userId, userId),
    with: { org: true },
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
  return rows
    .filter((r) => r.org)
    .map((r) => ({
      orgId: r.orgId,
      name: r.org!.name,
      role: r.role as OrgRole,
    }));
}

// The org a session should default to: its stored active org if still valid,
// else the user's first membership.
async function resolveActiveOrg(
  userId: string,
  activeOrgId: string | null,
): Promise<{ orgId: string; role: OrgRole } | null> {
  const mine = await getMembershipsForUser(userId);
  if (mine.length === 0) return null;
  const current = activeOrgId ? mine.find((m) => m.orgId === activeOrgId) : null;
  const chosen = current ?? mine[0];
  return { orgId: chosen.orgId, role: chosen.role };
}

export async function createSession(userId: string, activeOrgId: string | null) {
  const sessionId = nanoid();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  await db.insert(sessions).values({ id: sessionId, userId, activeOrgId, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return sessionId;
}

export async function setActiveOrg(sessionId: string, orgId: string) {
  await db.update(sessions).set({ activeOrgId: orgId }).where(eq(sessions.id, sessionId));
}

export async function destroySession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    cookieStore.delete(SESSION_COOKIE);
  }
}

// Loads the live session row (id + activeOrgId + user), or null. Clears expired.
async function loadSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    with: { user: true },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await db.delete(sessions).where(eq(sessions.id, sessionId));
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }
  return session;
}

// The human account for the current request (auth identity).
export async function getCurrentUser() {
  const session = await loadSession();
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

// The full request context: the human user + the active organization (workspace)
// and the user's role in it. Data routes scope by `org.id`. Self-heals the
// session's active org if it's unset or points at an org the user has left.
export async function getActiveContext() {
  const session = await loadSession();
  if (!session) return null;

  const resolved = await resolveActiveOrg(session.user.id, session.activeOrgId);
  if (!resolved) return null;

  if (session.activeOrgId !== resolved.orgId) {
    await setActiveOrg(session.id, resolved.orgId);
  }

  return {
    sessionId: session.id,
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    org: { id: resolved.orgId, role: resolved.role },
  };
}
