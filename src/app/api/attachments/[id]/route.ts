import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { jsonError, requireOrg } from "@/lib/api";
import { deleteAttachmentFile } from "@/lib/attachments/storage";
import { getOwnedAttachment } from "@/lib/ownership";
import { serializeAttachment } from "@/lib/serializers";

type Params = { params: Promise<{ id: string }> };

// Update editable fields on an attachment — the caption and the free-text context
// the user adds before (re-)analysis. Other fields are immutable here.
export async function PATCH(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const existing = await getOwnedAttachment(id, org.id);
  if (!existing) return jsonError("Attachment not found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body", 400);
  }
  const data = (body ?? {}) as { caption?: unknown; userContext?: unknown };

  const update: Partial<typeof attachments.$inferInsert> = {};
  if (typeof data.caption === "string") {
    update.caption = data.caption.trim() || null;
  }
  if (typeof data.userContext === "string") {
    update.userContext = data.userContext.trim() || null;
  }

  if (Object.keys(update).length === 0) {
    return jsonError("Nothing to update", 400);
  }

  await db.update(attachments).set(update).where(eq(attachments.id, id));

  const row = await db.query.attachments.findFirst({
    where: eq(attachments.id, id),
    with: { insight: true },
  });
  return NextResponse.json({ attachment: serializeAttachment(row!, row!.insight) });
}

// Delete an attachment (DB row + the file on disk).
export async function DELETE(_request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const existing = await getOwnedAttachment(id, org.id);
  if (!existing) return jsonError("Attachment not found", 404);

  await db.delete(attachments).where(eq(attachments.id, id));
  await deleteAttachmentFile(existing.storedName);

  return NextResponse.json({ ok: true });
}
