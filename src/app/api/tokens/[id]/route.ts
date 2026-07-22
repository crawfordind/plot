import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { handleApiError, jsonError, requireOrg } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/tokens/[id] — revoke a token (scoped to the active workspace).
export async function DELETE(_request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;
  const { id } = await params;

  try {
    const existing = await db.query.apiTokens.findFirst({
      where: and(eq(apiTokens.id, id), eq(apiTokens.orgId, org.id)),
    });
    if (!existing) return jsonError("Token not found", 404);

    await db.delete(apiTokens).where(eq(apiTokens.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "revoke access token");
  }
}
