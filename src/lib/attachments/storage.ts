import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AttachmentKind } from "@/lib/types";

// Where uploaded files live on disk. Defaults to ./uploads under the project, can
// be overridden with UPLOAD_DIR (e.g. a mounted volume in production). The bytes
// live here; metadata lives in the `attachments` DB table.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");

// 50 MB cap keeps a stray video from filling the disk; tune via the call site.
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

// Accepted content. Permissive for a field tool (photos, clips, scans, docs) but
// not a dumping ground for arbitrary executables.
export function attachmentKind(mime: string): AttachmentKind | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "video"; // grouped with media for the UI
  const docTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/csv",
    "application/csv",
  ];
  if (mime.startsWith("text/") || docTypes.includes(mime)) return "document";
  return null;
}

// Restrict to a safe basename — defends the read/delete paths against traversal
// even though stored names are server-generated.
function resolveStored(storedName: string): string {
  return path.join(UPLOAD_DIR, path.basename(storedName));
}

export async function saveAttachmentFile(
  storedName: string,
  bytes: Buffer,
): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(resolveStored(storedName), bytes);
}

export async function readAttachmentFile(storedName: string): Promise<Buffer> {
  return readFile(resolveStored(storedName));
}

export async function deleteAttachmentFile(storedName: string): Promise<void> {
  try {
    await unlink(resolveStored(storedName));
  } catch {
    // Already gone — deleting the DB row is what matters.
  }
}

// A short, safe file extension taken from the original name (lowercased, letters
// and digits only), e.g. "photo.JPEG" → ".jpeg". Empty when there's no clean ext.
export function safeExtension(fileName: string): string {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? `.${ext}` : "";
}
