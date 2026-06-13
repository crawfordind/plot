import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { jsonError, requireOrg } from "@/lib/api";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentKind,
  safeExtension,
  saveAttachmentFile,
} from "@/lib/attachments/storage";
import { getOwnedLocation } from "@/lib/ownership";
import { serializeAttachment } from "@/lib/serializers";

// List the attachments for a location (newest first).
export async function GET(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const locationId = new URL(request.url).searchParams.get("locationId");
  if (!locationId) return jsonError("locationId is required", 400);

  const rows = await db.query.attachments.findMany({
    where: (table, { and, eq: eqFn }) =>
      and(eqFn(table.orgId, org.id), eqFn(table.locationId, locationId)),
    orderBy: () => [desc(attachments.createdAt)],
  });

  return NextResponse.json({ attachments: rows.map(serializeAttachment) });
}

// Upload a photo / media / document and attach it to a location. Multipart form:
// `file` (the binary) + `locationId` (+ optional `caption`).
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
  const locationId = form.get("locationId");
  const caption = form.get("caption");

  if (!(file instanceof File)) return jsonError("No file provided", 400);
  if (typeof locationId !== "string" || !locationId) {
    return jsonError("locationId is required", 400);
  }

  const location = await getOwnedLocation(locationId, org.id);
  if (!location) return jsonError("Location not found", 404);

  if (file.size === 0) return jsonError("File is empty", 400);
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return jsonError("File is larger than the 50 MB limit", 413);
  }

  const kind = attachmentKind(file.type || "application/octet-stream");
  if (!kind) return jsonError("That file type isn't supported", 415);

  const id = nanoid();
  const storedName = `${id}${safeExtension(file.name)}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    await saveAttachmentFile(storedName, bytes);
  } catch {
    return jsonError("Couldn't store the file", 500);
  }

  await db.insert(attachments).values({
    id,
    orgId: org.id,
    userId: user.id,
    locationId,
    fileName: file.name || storedName,
    storedName,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    kind,
    caption: typeof caption === "string" && caption.trim() ? caption.trim() : null,
  });

  const row = await db.query.attachments.findFirst({
    where: eq(attachments.id, id),
  });

  return NextResponse.json(
    { attachment: serializeAttachment(row!) },
    { status: 201 },
  );
}
