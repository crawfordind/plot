import { NextResponse } from "next/server";
import { requireOrg, requireRole } from "@/lib/api";
import { cancelInvite } from "@/lib/orgs";

type Params = { params: Promise<{ id: string }> };

// Cancel a pending invite (admins + owners).
export async function DELETE(_request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;
  const forbidden = requireRole(org.role, "admin");
  if (forbidden) return forbidden;

  const { id } = await params;
  await cancelInvite(org.id, id);
  return NextResponse.json({ ok: true });
}
