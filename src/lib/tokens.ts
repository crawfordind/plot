import { createHash, randomBytes } from "node:crypto";

// Personal access tokens for read-only external API access (e.g. QGIS pulling a
// farm's GeoJSON). We store only the SHA-256 hash; the raw token is shown to the
// user exactly once. Format: "plot_pat_<43 url-safe chars>".
const TOKEN_PREFIX = "plot_pat_";
const PREVIEW_LEN = TOKEN_PREFIX.length + 6; // "plot_pat_a1b2c3"

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateToken(): { raw: string; hash: string; prefix: string } {
  const raw = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, PREVIEW_LEN) };
}

// A token presented to an export route can ride in the Authorization header
// (preferred) or a `token` query param (so a plain QGIS "Add Layer from URL"
// works). Returns the raw token string, or null if none was supplied.
export function readToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  const url = new URL(request.url);
  return url.searchParams.get("token")?.trim() || null;
}
