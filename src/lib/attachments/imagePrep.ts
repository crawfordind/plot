import sharp from "sharp";
import exifr from "exifr";

// Server-side image prep for the vision LLM. We never alter the stored original —
// these helpers produce an in-memory, model-ready copy and read metadata off the
// uploaded bytes.

// Longest edge we send to the model. Field photos are often 12+ MP; downscaling
// keeps token cost and latency sane without losing the detail the model needs.
const VISION_MAX_EDGE = 1024;

// A FIXED reference grid drawn on every image so the model can cite consistent
// positions ("chlorosis concentrated in C3"). 5 columns A–E × 5 rows 1–5; the
// same scheme regardless of the photo's aspect ratio.
const GRID_COLS = ["A", "B", "C", "D", "E"] as const;
const GRID_ROWS = ["1", "2", "3", "4", "5"] as const;

export const GRID_SPEC = {
  cols: GRID_COLS.length,
  rows: GRID_ROWS.length,
  // Human-readable description injected into the prompt so the model knows the scheme.
  description:
    "The image has a fixed reference grid overlaid: 5 columns labelled A–E (left to right) " +
    "and 5 rows labelled 1–5 (top to bottom). Cell A1 is top-left, E5 is bottom-right. " +
    "Cite locations by cell, e.g. \"leaf chlorosis concentrated in C3–C4\".",
} as const;

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === "<"
      ? "&lt;"
      : c === ">"
        ? "&gt;"
        : c === "&"
          ? "&amp;"
          : c === "'"
            ? "&apos;"
            : "&quot;",
  );
}

// Build an SVG the exact size of the (resized) image with grid lines + cell labels.
function gridSvg(width: number, height: number): Buffer {
  const colW = width / GRID_COLS.length;
  const rowH = height / GRID_ROWS.length;
  const stroke = "rgba(255,255,255,0.45)";
  const labelSize = Math.max(11, Math.round(Math.min(colW, rowH) * 0.16));

  const lines: string[] = [];
  for (let c = 1; c < GRID_COLS.length; c++) {
    const x = (c * colW).toFixed(1);
    lines.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${stroke}" stroke-width="1"/>`,
    );
  }
  for (let r = 1; r < GRID_ROWS.length; r++) {
    const y = (r * rowH).toFixed(1);
    lines.push(
      `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${stroke}" stroke-width="1"/>`,
    );
  }

  const labels: string[] = [];
  for (let c = 0; c < GRID_COLS.length; c++) {
    for (let r = 0; r < GRID_ROWS.length; r++) {
      const x = (c * colW + 3).toFixed(1);
      const y = (r * rowH + labelSize + 1).toFixed(1);
      const text = escapeXml(`${GRID_COLS[c]}${GRID_ROWS[r]}`);
      labels.push(
        `<text x="${x}" y="${y}" font-family="sans-serif" font-size="${labelSize}" ` +
          `fill="rgba(255,255,255,0.85)" stroke="rgba(0,0,0,0.55)" stroke-width="0.5" ` +
          `paint-order="stroke">${text}</text>`,
      );
    }
  }

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      lines.join("") +
      labels.join("") +
      `</svg>`,
  );
}

export type PreparedImage = {
  dataUrl: string;
  width: number;
  height: number;
};

// Downscale, draw the fixed grid, and return a base64 JPEG data URL ready to drop
// into an OpenRouter vision message.
export async function prepareForVision(bytes: Buffer): Promise<PreparedImage> {
  // EXIF-rotate, downscale (never upscale), and normalise to RGB JPEG.
  const base = sharp(bytes)
    .rotate()
    .resize({
      width: VISION_MAX_EDGE,
      height: VISION_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });

  const { data, info } = await base
    .jpeg({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const overlay = gridSvg(info.width, info.height);
  const composited = await sharp(data)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 82 })
    .toBuffer();

  return {
    dataUrl: `data:image/jpeg;base64,${composited.toString("base64")}`,
    width: info.width,
    height: info.height,
  };
}

export type PhotoExif = {
  lat: number | null;
  lng: number | null;
  heading: number | null;
  capturedAt: Date | null;
};

// Best-effort EXIF read for uploaded photos: GPS position, compass heading, and
// the original capture time. Any field may be null; a photo with no EXIF returns
// all-null rather than throwing.
export async function readPhotoExif(bytes: Buffer): Promise<PhotoExif> {
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = await exifr.parse(bytes, {
      gps: true,
      pick: [
        "latitude",
        "longitude",
        "GPSImgDirection",
        "GPSDestBearing",
        "DateTimeOriginal",
        "CreateDate",
      ],
    });
  } catch {
    parsed = undefined;
  }
  if (!parsed) return { lat: null, lng: null, heading: null, capturedAt: null };

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const date = (v: unknown): Date | null =>
    v instanceof Date && !Number.isNaN(v.getTime()) ? v : null;

  const lat = num(parsed.latitude);
  const lng = num(parsed.longitude);
  const heading = num(parsed.GPSImgDirection) ?? num(parsed.GPSDestBearing);

  return {
    lat: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
    lng: lng !== null && lng >= -180 && lng <= 180 ? lng : null,
    heading: heading !== null ? ((heading % 360) + 360) % 360 : null,
    capturedAt: date(parsed.DateTimeOriginal) ?? date(parsed.CreateDate),
  };
}
