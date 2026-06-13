import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { memberships, orgInvites, organizations, users } from "@/db/schema";
import type {
  MemberRecord,
  OrganizationRecord,
  OrgRole,
  PendingInviteRecord,
} from "@/lib/types";

// Create a new organization and make the user its owner.
export async function createOrganization(
  userId: string,
  name: string,
): Promise<OrganizationRecord> {
  const id = nanoid();
  await db.insert(organizations).values({ id, name, createdByUserId: userId });
  await db.insert(memberships).values({
    id: nanoid(),
    orgId: id,
    userId,
    role: "owner",
  });
  return { id, name, role: "owner" };
}

export async function renameOrganization(orgId: string, name: string) {
  await db.update(organizations).set({ name }).where(eq(organizations.id, orgId));
}

export async function getMembership(orgId: string, userId: string) {
  return db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
  });
}

// All members of an org, with their account info and role.
export async function listMembers(
  orgId: string,
  currentUserId: string,
): Promise<MemberRecord[]> {
  const rows = await db.query.memberships.findMany({
    where: eq(memberships.orgId, orgId),
    with: { user: true },
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });
  return rows
    .filter((r) => r.user)
    .map((r) => ({
      userId: r.userId,
      email: r.user!.email,
      name: r.user!.name,
      role: r.role as OrgRole,
      isYou: r.userId === currentUserId,
    }));
}

export async function listPendingInvites(
  orgId: string,
): Promise<PendingInviteRecord[]> {
  const rows = await db.query.orgInvites.findMany({
    where: and(eq(orgInvites.orgId, orgId), isNull(orgInvites.acceptedAt)),
    orderBy: (i, { desc }) => [desc(i.createdAt)],
  });
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as OrgRole,
    createdAt: r.createdAt.toISOString(),
  }));
}

function countOwners(members: { role: OrgRole; userId: string }[]) {
  return members.filter((m) => m.role === "owner").length;
}

// Invite someone by email. If they already have an account they're added to the
// org immediately; otherwise a pending invite waits for them to sign up / log in.
export async function inviteToOrg(
  orgId: string,
  email: string,
  role: "admin" | "member",
  invitedByUserId: string,
): Promise<{ status: "added" | "invited" | "already_member" }> {
  const normalized = email.toLowerCase();
  const account = await db.query.users.findFirst({
    where: eq(users.email, normalized),
  });

  if (account) {
    const existing = await getMembership(orgId, account.id);
    if (existing) return { status: "already_member" };
    await db.insert(memberships).values({
      id: nanoid(),
      orgId,
      userId: account.id,
      role,
    });
    return { status: "added" };
  }

  // No account yet — record a pending invite (replace any prior pending one).
  await db
    .delete(orgInvites)
    .where(
      and(
        eq(orgInvites.orgId, orgId),
        eq(orgInvites.email, normalized),
        isNull(orgInvites.acceptedAt),
      ),
    );
  await db.insert(orgInvites).values({
    id: nanoid(),
    orgId,
    email: normalized,
    role,
    invitedByUserId,
    token: nanoid(32),
  });
  return { status: "invited" };
}

export async function cancelInvite(orgId: string, inviteId: string) {
  await db
    .delete(orgInvites)
    .where(and(eq(orgInvites.id, inviteId), eq(orgInvites.orgId, orgId)));
}

// Remove a member. Refuses to remove the last owner so an org can't be orphaned.
export async function removeMember(
  orgId: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const members = await db.query.memberships.findMany({
    where: eq(memberships.orgId, orgId),
  });
  const target = members.find((m) => m.userId === userId);
  if (!target) return { ok: false, error: "Not a member" };
  if (
    target.role === "owner" &&
    countOwners(members as { role: OrgRole; userId: string }[]) <= 1
  ) {
    return { ok: false, error: "Can't remove the last owner" };
  }
  await db
    .delete(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  return { ok: true };
}

// Change a member's role. Refuses to demote the last owner.
export async function setMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<{ ok: boolean; error?: string }> {
  const members = await db.query.memberships.findMany({
    where: eq(memberships.orgId, orgId),
  });
  const target = members.find((m) => m.userId === userId);
  if (!target) return { ok: false, error: "Not a member" };
  if (
    target.role === "owner" &&
    role !== "owner" &&
    countOwners(members as { role: OrgRole; userId: string }[]) <= 1
  ) {
    return { ok: false, error: "Promote another owner first" };
  }
  await db
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  return { ok: true };
}
