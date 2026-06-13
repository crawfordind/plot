"use client";

import type { CaptureFix } from "@/lib/capture/geo";

// Client-side image prep before upload. Two reasons:
//   1. Vercel caps a Serverless Function request body at ~4.5 MB, so a raw phone
//      photo (often 5–12 MB) fails before it reaches our route. Downscaling +
//      re-encoding keeps every upload comfortably under that ceiling.
//   2. Storing a web-sized JPEG instead of the full-res original saves storage
//      and bandwidth — the model only needs ~1024px anyway.
//
// Canvas re-encoding strips EXIF, so we read GPS/heading/time FIRST and return
// them, letting the caller preserve that data as explicit fields.

// Longest edge we keep for storage. Generous enough to zoom into a leaf, small
// enough to stay well under the upload ceiling.
const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.82;
// Don't bother re-encoding an image already small enough to upload cleanly.
const SKIP_IF_UNDER_BYTES = 3 * 1024 * 1024;

export type PreparedExif = {
  lat: number | null;
  lng: number | null;
  heading: number | null;
  capturedAt: Date | null;
};

export type PreparedUpload = {
  file: File;
  exif: PreparedExif | null;
  // True when we actually resized/re-encoded (vs. passing the original through).
  reencoded: boolean;
};

async function readExif(file: File): Promise<PreparedExif | null> {
  try {
    // Lazy-loaded so exifr stays out of the main bundle until a photo is picked.
    const exifr = (await import("exifr")).default;
    const parsed = (await exifr.parse(file, {
      gps: true,
      pick: [
        "latitude",
        "longitude",
        "GPSImgDirection",
        "GPSDestBearing",
        "DateTimeOriginal",
        "CreateDate",
      ],
    })) as Record<string, unknown> | undefined;
    if (!parsed) return null;

    const n = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    const d = (v: unknown) =>
      v instanceof Date && !Number.isNaN(v.getTime()) ? v : null;
    const heading = n(parsed.GPSImgDirection) ?? n(parsed.GPSDestBearing);
    const lat = n(parsed.latitude);
    const lng = n(parsed.longitude);

    return {
      lat: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
      lng: lng !== null && lng >= -180 && lng <= 180 ? lng : null,
      heading: heading !== null ? ((heading % 360) + 360) % 360 : null,
      capturedAt: d(parsed.DateTimeOriginal) ?? d(parsed.CreateDate),
    };
  } catch {
    return null;
  }
}

async function decode(file: File): Promise<{
  draw: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  // createImageBitmap applies EXIF orientation for us where supported.
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      draw: bmp,
      width: bmp.width,
      height: bmp.height,
      cleanup: () => bmp.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
      return {
        draw: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        cleanup: () => URL.revokeObjectURL(url),
      };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "photo"}.jpg`;
}

// Resize (if needed) + re-encode an image File to a web-sized JPEG, returning the
// new File plus any EXIF we recovered. Non-images and decode failures pass through
// untouched. Never throws — on any error it returns the original file.
export async function prepareImageForUpload(
  file: File,
): Promise<PreparedUpload> {
  if (!file.type.startsWith("image/")) {
    return { file, exif: null, reencoded: false };
  }

  const exif = await readExif(file);

  // Small images that are already uploadable: keep as-is (still return EXIF).
  if (file.size <= SKIP_IF_UNDER_BYTES) {
    return { file, exif, reencoded: false };
  }

  try {
    const { draw, width, height, cleanup } = await decode(file);
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { file, exif, reencoded: false };
      ctx.drawImage(draw, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
      );
      if (!blob || blob.size >= file.size) {
        // Re-encoding didn't help — keep the original.
        return { file, exif, reencoded: false };
      }
      const out = new File([blob], jpegName(file.name), { type: "image/jpeg" });
      return { file: out, exif, reencoded: true };
    } finally {
      cleanup();
    }
  } catch {
    return { file, exif, reencoded: false };
  }
}

// Merge a live GPS fix (from in-app capture) with EXIF read off the file. The live
// fix wins when present; EXIF fills the gaps (e.g. a library photo). capturedAt
// uses EXIF for uploads and "now" for a live shot.
export function mergeCaptureGeo(
  fix: CaptureFix | null,
  exif: PreparedExif | null,
  live: boolean,
): {
  lat: number | null;
  lng: number | null;
  heading: number | null;
  accuracy: number | null;
  capturedAt: number | null;
} {
  return {
    lat: fix?.lat ?? exif?.lat ?? null,
    lng: fix?.lng ?? exif?.lng ?? null,
    heading: fix?.heading ?? exif?.heading ?? null,
    accuracy: fix?.accuracy ?? null,
    capturedAt: live ? Date.now() : (exif?.capturedAt?.getTime() ?? null),
  };
}
