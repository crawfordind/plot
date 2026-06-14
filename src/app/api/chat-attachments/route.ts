import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { chatAttachments, conversations } from "@/db/schema";
import { jsonError, requireOrg } from "@/lib/api";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentKind,
  deleteAttachmentFile,
  safeExtension,
  saveAttachmentFile,
} from "@/lib/attachments/storage";
import { extractDocText, summarizeImage } from "@/lib/chat/attachmentContext";

// Upload a file the user wants to attach to a chat message. Multipart form:
//   file (required), conversationId (required).
// The row starts unlinked (messageId null) and is attached to the user message
// when it's sent. We process the file NOW (vision read for images, text extract
// for docs) so it's ready by the time the user hits send — the work overlaps
// with them finishing their question. Images should be pre-shrunk client-side.
export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Expected a multipart form upload", 400);
  }

  const file = form.get("file");
  const conversationIdRaw = form.get("conversationId");
  if (!(file instanceof File)) return jsonError("No file provided", 400);
  if (typeof conversationIdRaw !== "string" || !conversationIdRaw) {
    return jsonError("conversationId is required", 400);
  }

  const convo = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationIdRaw),
      eq(conversations.orgId, org.id),
      eq(conversations.userId, user.id),
    ),
  });
  if (!convo) return jsonError("Conversation not found", 404);

  if (file.size === 0) return jsonError("File is empty", 400);
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return jsonError("File is larger than the 50 MB limit", 413);
  }

  const mimeType = file.type || "application/octet-stream";
  const rawKind = attachmentKind(mimeType);
  if (rawKind !== "image" && rawKind !== "document") {
    return jsonError("Only images and documents can be attached to chat", 415);
  }
  const kind: "image" | "document" = rawKind;

  const bytes = Buffer.from(await file.arrayBuffer());
  const id = nanoid();
  const storedName = `${id}${safeExtension(file.name)}`;

  try {
    await saveAttachmentFile(storedName, bytes);
  } catch (error) {
    console.error("Chat attachment upload to object storage failed:", error);
    return jsonError("Couldn't store the file", 500);
  }

  // Best-effort enrichment — a failure here just means the file carries no
  // context, not that the upload failed.
  let extractedText: string | null = null;
  let visionSummary: string | null = null;
  try {
    if (kind === "image") visionSummary = await summarizeImage(bytes);
    else extractedText = (await extractDocText(bytes, mimeType)) || null;
  } catch (error) {
    console.error("Chat attachment processing failed:", error);
  }

  try {
    await db.insert(chatAttachments).values({
      id,
      orgId: org.id,
      userId: user.id,
      conversationId: convo.id,
      messageId: null,
      fileName: file.name || storedName,
      storedName,
      mimeType,
      sizeBytes: file.size,
      kind,
      extractedText,
      visionSummary,
    });
  } catch (error) {
    console.error("Chat attachment DB insert failed:", error);
    await deleteAttachmentFile(storedName).catch(() => {});
    return jsonError(
      "Couldn't save the attachment. If this keeps happening, the database schema may be out of date (run db:push).",
      500,
    );
  }

  return NextResponse.json(
    {
      attachment: {
        id,
        fileName: file.name || storedName,
        kind,
        mimeType,
        sizeBytes: file.size,
        hasContext: Boolean(extractedText || visionSummary),
      },
    },
    { status: 201 },
  );
}
