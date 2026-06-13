import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { setActiveOrg } from "@/lib/auth";
import { getMembership } from "@/lib/orgs";
import { switchOrgSchema } from "@/lib/validators";

// Switch the active workspace. Only orgs the user is a member of are allowed.
export async function POST(request: Request) {
  const { user, sessionId, response } = await requireOrg();
  if (!user || !sessionId) return response!;

  try {
    const { orgId } = switchOrgSchema.parse(await request.json());
    const membership = await getMembership(orgId, user.id);
    if (!membership) return jsonError("You're not a member of that workspace", 403);
    await setActiveOrg(sessionId, orgId);
    return NextResponse.json({ ok: true, activeOrgId: orgId });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to switch workspace", 500);
  }
}
