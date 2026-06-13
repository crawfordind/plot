import { jsonError, requireOrg } from "@/lib/api";
import { readAttachmentFile } from "@/lib/attachments/storage";
import { getOwnedAttachment } from "@/lib/ownership";

type Params = { params: Promise<{ id: string }> };

// Stream the raw bytes of an attachment (ownership-checked). Used as the `src`
// for <img>/<video> and for downloads.
export async function GET(_request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const attachment = await getOwnedAttachment(id, org.id);
  if (!attachment) return jsonError("Attachment not found", 404);

  let bytes: Buffer;
  try {
    bytes = await readAttachmentFile(attachment.storedName);
  } catch {
    return jsonError("File is missing", 404);
  }

  // Quote the filename and strip characters that could break the header.
  const safeName = attachment.fileName.replace(/["\\\r\n]/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(bytes.length),
      // Private: these are per-user files behind auth.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
