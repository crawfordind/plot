import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { jsonError, requireOrg } from "@/lib/api";
import { deleteAttachmentFile } from "@/lib/attachments/storage";
import { getOwnedAttachment } from "@/lib/ownership";

type Params = { params: Promise<{ id: string }> };

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
