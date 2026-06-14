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

// A catch-all for route handlers. Turns whatever was thrown into the most
// specific *and safe* response we can: validation errors and malformed JSON
// become 4xx with a real reason; database constraint violations become a 409;
// everything else is logged (with the action for triage) and returns a generic
// 500 so we never leak internals to the client. Usage:
//
//   } catch (error) {
//     return handleApiError(error, "create location");
//   }
//
// `action` is a short verb phrase ("create location", "save move") used both in
// the server log and to phrase the fallback message.
export function handleApiError(error: unknown, action: string) {
  if (error instanceof ZodError) {
    return handleZodError(error);
  }

  // `request.json()` throws a SyntaxError on a malformed/empty body.
  if (error instanceof SyntaxError) {
    return jsonError("The request was malformed and couldn't be read.", 400);
  }

  // SQLite/libSQL surfaces constraint failures with codes in the message.
  const raw = error instanceof Error ? error.message : String(error);
  if (/UNIQUE constraint failed/i.test(raw)) {
    return jsonError("That already exists — please use a different value.", 409);
  }
  if (/FOREIGN KEY constraint failed/i.test(raw)) {
    return jsonError(
      "That references something that no longer exists. Refresh and try again.",
      409,
    );
  }
  if (/NOT NULL constraint failed/i.test(raw)) {
    return jsonError("A required field was missing.", 400);
  }

  // Unknown / unexpected — log with context for triage, return a safe message.
  console.error(`[api] Failed to ${action}:`, error);
  return jsonError(`Couldn't ${action}. Please try again in a moment.`, 500);
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
