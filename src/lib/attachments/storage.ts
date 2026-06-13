import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { AttachmentKind } from "@/lib/types";

// Uploaded bytes live in an S3-compatible object store (AWS S3 or Cloudflare R2);
// metadata lives in the `attachments` DB table. Object storage is required on
// serverless hosts like Vercel, where the local filesystem is read-only and
// ephemeral. Configure via env:
//   S3_BUCKET            (required) bucket name
//   S3_ACCESS_KEY_ID     (required)
//   S3_SECRET_ACCESS_KEY (required)
//   S3_REGION            region; "auto" for R2 (default "auto")
//   S3_ENDPOINT          custom endpoint, e.g. https://<acct>.r2.cloudflarestorage.com
//                        (required for R2; omit for AWS S3)
//   S3_FORCE_PATH_STYLE  "true" to use path-style URLs (often needed for R2/MinIO)
//   S3_KEY_PREFIX        optional key prefix to namespace objects in the bucket
const S3_KEY_PREFIX = (process.env.S3_KEY_PREFIX ?? "attachments")
  .replace(/^\/+|\/+$/g, "");

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not configured");
  return bucket;
}

// Lazy singleton so importing this module doesn't require S3 config at build time
// (only when an attachment is actually read/written).
let client: S3Client | null = null;
function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  return client;
}

// 50 MB cap keeps a stray video from blowing up storage; tune via the call site.
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
function objectKey(storedName: string): string {
  const name = path.basename(storedName);
  return S3_KEY_PREFIX ? `${S3_KEY_PREFIX}/${name}` : name;
}

export async function saveAttachmentFile(
  storedName: string,
  bytes: Buffer,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: objectKey(storedName),
      Body: bytes,
      ContentLength: bytes.length,
    }),
  );
}

export async function readAttachmentFile(storedName: string): Promise<Buffer> {
  const result = await getClient().send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: objectKey(storedName),
    }),
  );
  if (!result.Body) throw new Error("Attachment object has no body");
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteAttachmentFile(storedName: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: objectKey(storedName),
      }),
    );
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
