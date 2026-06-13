import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getActiveContext, getCurrentUser } from "@/lib/auth";
import type { OrgRole } from "@/lib/types";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleZodError(error: ZodError) {
  const message = error.issues.map((issue) => issue.message).join(", ");
  return jsonError(message);
}

// Auth-only gate (the human account). Use for account/session endpoints.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: jsonError("Unauthorized", 401) };
  }
  return { user, response: null };
}

// The standard gate for DATA routes: returns the human user plus the active
// organization (workspace) and the user's role in it. Every data query scopes by
// `org.id`, so all members of an org share its data.
export async function requireOrg() {
  const ctx = await getActiveContext();
  if (!ctx) {
    return { user: null, org: null, sessionId: null, response: jsonError("Unauthorized", 401) };
  }
  return { user: ctx.user, org: ctx.org, sessionId: ctx.sessionId, response: null };
}

// Guard an action behind a minimum role. Returns a 403 response when the role is
// insufficient, else null.
const ROLE_RANK: Record<OrgRole, number> = { member: 0, admin: 1, owner: 2 };
export function requireRole(role: OrgRole, minimum: OrgRole) {
  if (ROLE_RANK[role] < ROLE_RANK[minimum]) {
    return jsonError("You don't have permission to do that", 403);
  }
  return null;
}
