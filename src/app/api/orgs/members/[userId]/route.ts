import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { handleApiError, handleZodError, jsonError, requireOrg, requireRole } from "@/lib/api";
import { removeMember, setMemberRole } from "@/lib/orgs";
import { setRoleSchema } from "@/lib/validators";

type Params = { params: Promise<{ userId: string }> };

// Change a member's role (owners only).
export async function PATCH(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;
  const forbidden = requireRole(org.role, "owner");
  if (forbidden) return forbidden;

  try {
    const { userId } = await params;
    const { role } = setRoleSchema.parse(await request.json());
    const result = await setMemberRole(org.id, userId, role);
    if (!result.ok) return jsonError(result.error ?? "Failed", 400);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return handleApiError(error, "update role");
  }
}

// Remove a member (admins + owners). Members can also remove themselves (leave).
export async function DELETE(_request: Request, { params }: Params) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  const { userId } = await params;
  if (userId !== user.id) {
    const forbidden = requireRole(org.role, "admin");
    if (forbidden) return forbidden;
  }

  const result = await removeMember(org.id, userId);
  if (!result.ok) return jsonError(result.error ?? "Failed", 400);
  return NextResponse.json({ ok: true });
}
