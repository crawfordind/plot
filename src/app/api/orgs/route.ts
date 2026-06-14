import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { handleApiError, handleZodError, requireOrg } from "@/lib/api";
import { getMembershipsForUser, setActiveOrg } from "@/lib/auth";
import { createOrganization } from "@/lib/orgs";
import { createOrgSchema } from "@/lib/validators";

// Every workspace the current user belongs to, plus which one is active.
export async function GET() {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  const memberships = await getMembershipsForUser(user.id);
  return NextResponse.json({
    activeOrgId: org.id,
    organizations: memberships.map((m) => ({
      id: m.orgId,
      name: m.name,
      role: m.role,
    })),
  });
}

// Create a new workspace and switch into it.
export async function POST(request: Request) {
  const { user, sessionId, response } = await requireOrg();
  if (!user || !sessionId) return response!;

  try {
    const { name } = createOrgSchema.parse(await request.json());
    const created = await createOrganization(user.id, name);
    await setActiveOrg(sessionId, created.id);
    return NextResponse.json({ organization: created }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return handleApiError(error, "create workspace");
  }
}
