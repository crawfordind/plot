"use client";

import type { CaptureFix } from "@/lib/capture/geo";

// Client-side image prep before upload. Two reasons:
//   1. Vercel caps a Serverless Function request body at ~4.5 MB, so a raw phone
//      photo (often 5–12 MB) fails before it reaches our route. Downscaling +
//      re-encoding keeps every upload comfortably under that ceiling.
//   2. Storing a web-sized JPEG instead of the full-res original saves storage
//      and bandwidth — the model only needs ~1024px anyway.
//
// Also converts HEIC/HEIF (the iPhone default) to JPEG: most browsers can't draw
// HEIC to a canvas, it won't render in <img>, and the server's sharp build can't
// decode it — so without this an iPhone photo uploads but is unviewable and
// un-analyzable. Canvas re-encoding strips EXIF, so we read GPS/heading/time
// FIRST and return them for the caller to preserve as explicit fields.

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.82;
// Skip re-encoding an image already small enough to upload cleanly.
const SKIP_IF_UNDER_BYTES = 3 * 1024 * 1024;
// Hard ceiling for a direct upload (Vercel body limit ~4.5 MB). Used to fail
// fast on non-image files we can't shrink client-side (videos, large PDFs).
export const MAX_DIRECT_UPLOAD_BYTES = 4.4 * 1024 * 1024;

export type PreparedExif = {
  lat: number | null;
  lng: number | null;
  heading: number | null;
  capturedAt: Date | null;
};

export type PreparedUpload = {
  file: File;
  exif: PreparedExif | null;
  reencoded: boolean;
};

function isHeic(file: File): boolean {
  return (
    /image\/(heic|heif)/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
  );
}

// True for anything we resize/convert client-side (real images + HEIC). Non-image
// files (video, PDF, docs) are left alone and subject to the direct-upload cap.
export function isImageLike(file: File): boolean {
  return file.type.startsWith("image/") || isHeic(file);
}

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

// Best-effort HEIC/HEIF → JPEG in the browser (lazy-loaded WASM). Returns null on
// failure so the caller can fall back to a native decode (Safari handles HEIC).
async function convertHeicToJpeg(file: File): Promise<File | null> {
  try {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], jpegName(file.name), { type: "image/jpeg" });
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

// Resize (if needed) + re-encode an image File to a web-sized JPEG, converting
// HEIC first and recovering EXIF. Non-images and decode failures pass through
// untouched. Never throws — on any error it returns the best file it has.
export async function prepareImageForUpload(
  file: File,
): Promise<PreparedUpload> {
  if (!isImageLike(file)) {
    return { file, exif: null, reencoded: false };
  }

  // Read EXIF off the ORIGINAL (exifr handles HEIC) before any conversion strips it.
  const exif = await readExif(file);
  const heic = isHeic(file);

  // HEIC: convert to JPEG up front so it renders and can be analyzed. If the WASM
  // conversion fails we keep the original and let the native decoder try (Safari).
  let working = file;
  if (heic) {
    const converted = await convertHeicToJpeg(file);
    if (converted) working = converted;
  }

  // Small, already-web-friendly images can skip re-encoding — but never skip when
  // the source was HEIC (we must end up with a real, renderable JPEG).
  if (!heic && working.size <= SKIP_IF_UNDER_BYTES) {
    return { file: working, exif, reencoded: false };
  }

  try {
    const { draw, width, height, cleanup } = await decode(working);
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { file: working, exif, reencoded: working !== file };
      // Flatten any transparency onto white so PNG/transparent sources don't get a
      // black background when encoded as JPEG.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(draw, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
      );
      if (!blob) return { file: working, exif, reencoded: working !== file };
      // For a normal image, keep the original if re-encoding didn't shrink it. For
      // HEIC we always take the JPEG (the original is unrenderable regardless).
      if (!heic && blob.size >= working.size) {
        return { file: working, exif, reencoded: false };
      }
      const out = new File([blob], jpegName(file.name), { type: "image/jpeg" });
      return { file: out, exif, reencoded: true };
    } finally {
      cleanup();
    }
  } catch {
    // Decode failed (e.g. HEIC on a browser without support and WASM convert also
    // failed). Return the best file we have; the upload may still reject it.
    return { file: working, exif, reencoded: working !== file };
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
