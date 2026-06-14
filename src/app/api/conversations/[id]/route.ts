import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { db } from "@/db";
import { chatAttachments, conversations } from "@/db/schema";
import { jsonError, requireOrg } from "@/lib/api";
import { deleteAttachmentFile } from "@/lib/attachments/storage";
import { serializeConversation } from "../route";

type Params = { params: Promise<{ id: string }> };

async function ownedConversationId(
  id: string,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const row = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, id),
      eq(conversations.orgId, orgId),
      eq(conversations.userId, userId),
    ),
    columns: { id: true },
  });
  return Boolean(row);
}

// Full thread: the conversation plus its messages (oldest first), each message
// carrying its attachments.
export async function GET(_request: Request, { params }: Params) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;
  const { id } = await params;

  const convo = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, id),
      eq(conversations.orgId, org.id),
      eq(conversations.userId, user.id),
    ),
    with: {
      messages: {
        orderBy: (m, { asc: ascFn }) => [ascFn(m.createdAt)],
        with: { attachments: true },
      },
    },
  });
  if (!convo) return jsonError("Conversation not found", 404);

  return NextResponse.json({
    conversation: serializeConversation(convo),
    messages: convo.messages.map((m) => ({
      id: m.id,
      role: m.role,
      expertId: m.expertId,
      content: m.content,
      createdAt: m.createdAt.getTime(),
      attachments: m.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        kind: a.kind,
        mimeType: a.mimeType,
      })),
    })),
  });
}

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");

// Rename / pin / archive a thread.
export async function PATCH(request: Request, { params }: Params) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;
  const { id } = await params;

  if (!(await ownedConversationId(id, org.id, user.id))) {
    return jsonError("Conversation not found", 404);
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues.map((i) => i.message).join(", "));
    }
    return jsonError("Invalid request");
  }

  await db
    .update(conversations)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.pinned !== undefined ? { pinned: body.pinned } : {}),
      ...(body.archived !== undefined ? { archived: body.archived } : {}),
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, id));

  const row = await db.query.conversations.findFirst({
    where: eq(conversations.id, id),
  });
  return NextResponse.json({ conversation: serializeConversation(row!) });
}

// Delete a thread and everything in it. The DB cascade removes message and
// attachment rows; we also clear the stored files from object storage.
export async function DELETE(_request: Request, { params }: Params) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;
  const { id } = await params;

  if (!(await ownedConversationId(id, org.id, user.id))) {
    return jsonError("Conversation not found", 404);
  }

  const files = await db.query.chatAttachments.findMany({
    where: eq(chatAttachments.conversationId, id),
    columns: { storedName: true },
  });
  await Promise.all(
    files.map((f) => deleteAttachmentFile(f.storedName).catch(() => {})),
  );

  await db.delete(conversations).where(eq(conversations.id, id));
  return NextResponse.json({ ok: true });
}
