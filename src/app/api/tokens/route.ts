import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z, ZodError } from "zod";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { handleApiError, jsonError, requireOrg } from "@/lib/api";
import { generateToken } from "@/lib/tokens";

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the token a name").max(60),
});

// GET /api/tokens — list this workspace's access tokens (metadata only; the raw
// token is never retrievable after creation).
export async function GET() {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const rows = await db.query.apiTokens.findMany({
    where: eq(apiTokens.orgId, org.id),
    orderBy: [desc(apiTokens.createdAt)],
  });

  return Response.json({
    tokens: rows.map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

// POST /api/tokens — mint a new read-only access token for the active workspace.
// The raw token is returned ONCE here and never again.
export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const { name } = createSchema.parse(await request.json());
    const { raw, hash, prefix } = generateToken();
    const id = nanoid();

    await db.insert(apiTokens).values({
      id,
      orgId: org.id,
      userId: user.id,
      name,
      tokenHash: hash,
      prefix,
    });

    return Response.json({ id, name, prefix, token: raw }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return jsonError(error.issues[0].message);
    return handleApiError(error, "create access token");
  }
}
