import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { handleZodError, jsonError, requireOrg, requireRole } from "@/lib/api";
import { renameOrganization } from "@/lib/orgs";
import { renameOrgSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

// Rename a workspace (admins + owners, and only the active one).
export async function PATCH(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;
  const forbidden = requireRole(org.role, "admin");
  if (forbidden) return forbidden;

  const { id } = await params;
  if (id !== org.id) return jsonError("Switch to that workspace first", 400);

  try {
    const { name } = renameOrgSchema.parse(await request.json());
    await renameOrganization(org.id, name);
    return NextResponse.json({ ok: true, name });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to rename workspace", 500);
  }
}
