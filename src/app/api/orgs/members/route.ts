import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { handleZodError, jsonError, requireOrg, requireRole } from "@/lib/api";
import { inviteToOrg, listMembers, listPendingInvites } from "@/lib/orgs";
import { inviteMemberSchema } from "@/lib/validators";

// Members of the active workspace + any pending email invites.
export async function GET() {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  const [members, invites] = await Promise.all([
    listMembers(org.id, user.id),
    listPendingInvites(org.id),
  ]);
  return NextResponse.json({ members, invites, role: org.role });
}

// Invite a teammate by email (admins + owners). Existing accounts join at once;
// new emails get a pending invite consumed when they sign up.
export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;
  const forbidden = requireRole(org.role, "admin");
  if (forbidden) return forbidden;

  try {
    const { email, role } = inviteMemberSchema.parse(await request.json());
    const result = await inviteToOrg(org.id, email, role, user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to invite", 500);
  }
}
