import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z, ZodError } from "zod";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { jsonError, requireOrg } from "@/lib/api";
import { isExpertId } from "@/lib/experts/personas";

// Parse the stored JSON expertIds back into a clean, validated list.
export function parseExpertIds(json: string): string[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter((x): x is string => typeof x === "string" && isExpertId(x))
      : [];
  } catch {
    return [];
  }
}

export function serializeConversation(c: {
  id: string;
  title: string | null;
  expertIds: string;
  pinned: boolean;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    title: c.title,
    expertIds: parseExpertIds(c.expertIds),
    pinned: c.pinned,
    updatedAt: c.updatedAt.getTime(),
  };
}

// List the current user's chat threads in this org (pinned first, then most
// recent). Chat history is personal even though farm data is org-shared.
export async function GET() {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  const rows = await db.query.conversations.findMany({
    where: and(
      eq(conversations.orgId, org.id),
      eq(conversations.userId, user.id),
      eq(conversations.archived, false),
    ),
    orderBy: [desc(conversations.pinned), desc(conversations.updatedAt)],
  });

  return NextResponse.json({ conversations: rows.map(serializeConversation) });
}

const createSchema = z.object({
  expertIds: z.array(z.string()).max(3).optional(),
});

// Start a new (empty) thread. Title is filled in after the first exchange.
export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json().catch(() => ({})));
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues.map((i) => i.message).join(", "));
    }
    return jsonError("Invalid request");
  }

  const expertIds = (body.expertIds ?? []).filter(isExpertId).slice(0, 3);
  const id = nanoid();
  await db.insert(conversations).values({
    id,
    orgId: org.id,
    userId: user.id,
    expertIds: JSON.stringify(expertIds),
  });

  const row = await db.query.conversations.findFirst({
    where: eq(conversations.id, id),
  });
  return NextResponse.json({ conversation: serializeConversation(row!) }, { status: 201 });
}
