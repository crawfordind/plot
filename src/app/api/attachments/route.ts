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
import { readPhotoExif } from "@/lib/attachments/imagePrep";
import { reverseGeocode } from "@/lib/geocode";
import { resolveNearestLocation } from "@/lib/locations/nearest";
import { getOwnedLocation } from "@/lib/ownership";
import { serializeAttachment } from "@/lib/serializers";
import type { AttachmentSource } from "@/lib/types";

const SOURCES: AttachmentSource[] = ["asset_camera", "live_camera", "upload"];

// List the attachments for a location (newest first), each with its AI insight.
export async function GET(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const locationId = new URL(request.url).searchParams.get("locationId");
  if (!locationId) return jsonError("locationId is required", 400);

  const rows = await db.query.attachments.findMany({
    where: (table, { and, eq: eqFn }) =>
      and(eqFn(table.orgId, org.id), eqFn(table.locationId, locationId)),
    orderBy: () => [desc(attachments.createdAt)],
    with: { insight: true },
  });

  return NextResponse.json({
    attachments: rows.map((row) => serializeAttachment(row, row.insight)),
  });
}

function num(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Upload a photo / media / document and attach it to a location. Multipart form:
//   file (required), locationId (required unless source=live_camera + GPS present),
//   caption?, source?, lat?, lng?, gpsAccuracy?, heading?, capturedAt? (ms epoch),
//   userContext?. For images, missing geo is backfilled from EXIF.
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
  const caption = form.get("caption");
  const userContextRaw = form.get("userContext");

  if (!(file instanceof File)) return jsonError("No file provided", 400);

  const sourceRaw = form.get("source");
  const source: AttachmentSource =
    typeof sourceRaw === "string" && SOURCES.includes(sourceRaw as AttachmentSource)
      ? (sourceRaw as AttachmentSource)
      : "upload";

  if (file.size === 0) return jsonError("File is empty", 400);
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return jsonError("File is larger than the 50 MB limit", 413);
  }

  const kind = attachmentKind(file.type || "application/octet-stream");
  if (!kind) return jsonError("That file type isn't supported", 415);

  const bytes = Buffer.from(await file.arrayBuffer());

  // Geo from the client (live capture); backfilled from EXIF for images.
  let lat = num(form.get("lat"));
  let lng = num(form.get("lng"));
  let heading = num(form.get("heading"));
  const gpsAccuracyM = num(form.get("gpsAccuracy"));
  const capturedAtMs = num(form.get("capturedAt"));
  let capturedAt = capturedAtMs !== null ? new Date(capturedAtMs) : null;

  if (kind === "image") {
    const exif = await readPhotoExif(bytes);
    if (lat === null) lat = exif.lat;
    if (lng === null) lng = exif.lng;
    if (heading === null) heading = exif.heading;
    if (capturedAt === null) capturedAt = exif.capturedAt;
  }

  // Resolve the owning location. In-field shots with no asset snap to the nearest.
  const locationIdRaw = form.get("locationId");
  let locationId =
    typeof locationIdRaw === "string" && locationIdRaw ? locationIdRaw : null;

  if (!locationId && source === "live_camera" && lat !== null && lng !== null) {
    locationId = await resolveNearestLocation(lat, lng, org.id);
  }
  if (!locationId) return jsonError("locationId is required", 400);

  const location = await getOwnedLocation(locationId, org.id);
  if (!location) return jsonError("Location not found", 404);

  // Best-effort place label (never blocks the upload).
  let placeLabel: string | null = null;
  if (lat !== null && lng !== null) {
    placeLabel = await reverseGeocode(lat, lng);
  }

  const id = nanoid();
  const storedName = `${id}${safeExtension(file.name)}`;

  try {
    await saveAttachmentFile(storedName, bytes);
  } catch {
    return jsonError("Couldn't store the file", 500);
  }

  const userContext =
    typeof userContextRaw === "string" && userContextRaw.trim()
      ? userContextRaw.trim()
      : null;

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
    caption:
      typeof caption === "string" && caption.trim() ? caption.trim() : null,
    source,
    lat,
    lng,
    gpsAccuracyM,
    heading,
    capturedAt,
    placeLabel,
    userContext,
    // Images await analysis; everything else is terminal-by-default.
    analysisStatus: kind === "image" ? "pending" : "done",
  });

  const row = await db.query.attachments.findFirst({
    where: eq(attachments.id, id),
    with: { insight: true },
  });

  return NextResponse.json(
    { attachment: serializeAttachment(row!, row!.insight) },
    { status: 201 },
  );
}
