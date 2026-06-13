import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { getActiveContext, getMembershipsForUser } from "@/lib/auth";

// Current account + active workspace + every org the user belongs to (for the
// workspace switcher).
export async function GET() {
  const ctx = await getActiveContext();
  if (!ctx) {
    return jsonError("Unauthorized", 401);
  }
  const memberships = await getMembershipsForUser(ctx.user.id);
  return NextResponse.json({
    user: ctx.user,
    org: ctx.org,
    organizations: memberships.map((m) => ({
      id: m.orgId,
      name: m.name,
      role: m.role,
    })),
  });
}
