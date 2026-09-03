import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { handleApiError, handleZodError, jsonError, requireOrg, requireRole } from "@/lib/api";
import { renameOrganization, setOrgHeightUnit } from "@/lib/orgs";
import { getOrgHeightUnit } from "@/lib/tags/resolve";
import { updateOrgSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

// Workspace settings (admins + owners, and only the active one): its name, and
// the unit field crews see heights in. The unit is display-only — storage stays
// centimetres — so flipping it is safe at any point in a season.
export async function PATCH(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;
  const forbidden = requireRole(org.role, "admin");
  if (forbidden) return forbidden;

  const { id } = await params;
  if (id !== org.id) return jsonError("Switch to that workspace first", 400);

  try {
    const data = updateOrgSchema.parse(await request.json());
    if (data.name !== undefined) await renameOrganization(org.id, data.name);
    if (data.heightUnit !== undefined) {
      await setOrgHeightUnit(org.id, data.heightUnit);
    }
    return NextResponse.json({
      ok: true,
      name: data.name,
      heightUnit: await getOrgHeightUnit(org.id),
    });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return handleApiError(error, "update workspace");
  }
}
