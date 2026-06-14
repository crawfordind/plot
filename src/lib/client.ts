// Centralized client-side fetch wrapper. Every component should go through
// `apiFetch` instead of raw `fetch` so that failures turn into a single,
// consistent `ApiError` carrying a *human* reason — not a bare status code or a
// thrown "Failed to fetch". The toast layer (see `useToast`) reads
// `getErrorMessage()` off whatever lands in a `catch`, so the message a user
// sees is decided here, once, rather than re-invented in every form.

export type ApiErrorKind =
  | "validation" // 400 / 422 — the request itself was rejected
  | "auth" // 401 — not signed in / session expired
  | "forbidden" // 403 — signed in but not allowed
  | "notFound" // 404 — the thing is gone
  | "conflict" // 409 — duplicate / stale write
  | "tooLarge" // 413 — payload too big
  | "rateLimit" // 429 — slow down
  | "server" // 5xx — our fault
  | "offline" // request never reached the server
  | "unknown";

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;
  /** The raw server-supplied message, if any (before friendly rewording). */
  readonly serverMessage?: string;
  /** Optional machine-readable code the server may include for the client. */
  readonly code?: string;

  constructor(
    message: string,
    opts: {
      status: number;
      kind: ApiErrorKind;
      serverMessage?: string;
      code?: string;
      cause?: unknown;
    },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "ApiError";
    this.status = opts.status;
    this.kind = opts.kind;
    this.serverMessage = opts.serverMessage;
    this.code = opts.code;
  }
}

function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 400:
    case 422:
      return "validation";
    case 401:
      return "auth";
    case 403:
      return "forbidden";
    case 404:
      return "notFound";
    case 409:
      return "conflict";
    case 413:
      return "tooLarge";
    case 429:
      return "rateLimit";
    default:
      return status >= 500 ? "server" : "unknown";
  }
}

// Fallbacks used only when the server didn't hand us a usable message. For
// 4xx (except auth) we trust the server's message because those are written for
// humans; for 5xx and network errors we never expose internals, so these
// generic-but-actionable lines stand in.
const FALLBACK_BY_KIND: Record<ApiErrorKind, string> = {
  validation: "Some of the details weren't accepted. Please review and try again.",
  auth: "Your session has expired. Please sign in again.",
  forbidden: "You don't have permission to do that.",
  notFound: "That item no longer exists — it may have been deleted.",
  conflict: "This was changed somewhere else. Refresh and try again.",
  tooLarge: "That file is too large to upload.",
  rateLimit: "You're going a bit fast — wait a moment and try again.",
  server: "Something went wrong on our end. Please try again in a moment.",
  offline: "Can't reach the server. Check your connection and try again.",
  unknown: "Something went wrong. Please try again.",
};

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  /**
   * Request body. A plain object is JSON-encoded (and a JSON Content-Type is
   * set automatically). `FormData`/`Blob`/string are passed through untouched
   * so the browser can set the right Content-Type (e.g. multipart boundaries).
   */
  body?: unknown;
};

function isPlainJsonBody(body: unknown): boolean {
  if (body == null) return false;
  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams ||
    (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
  ) {
    return false;
  }
  return typeof body === "object" || typeof body === "number" || typeof body === "boolean";
}

/**
 * Fetch JSON from one of our API routes, returning the parsed body on success
 * and throwing a richly-described `ApiError` on any failure (HTTP or network).
 *
 * @example
 * const { location } = await apiFetch<{ location: Location }>("/api/locations", {
 *   method: "POST",
 *   body: { name, type, geometry },
 * });
 */
export async function apiFetch<T = unknown>(
  input: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  let finalBody: BodyInit | undefined;

  if (isPlainJsonBody(body)) {
    finalBody = JSON.stringify(body);
    if (!finalHeaders.has("Content-Type")) {
      finalHeaders.set("Content-Type", "application/json");
    }
  } else if (body != null) {
    finalBody = body as BodyInit;
  }

  let response: Response;
  try {
    response = await fetch(input, { ...rest, headers: finalHeaders, body: finalBody });
  } catch (cause) {
    // A thrown fetch means the request never completed — DNS, offline,
    // CORS, or a hard abort. There is no status to read.
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw cause; // caller cancelled on purpose; let them handle it
    }
    throw new ApiError(FALLBACK_BY_KIND.offline, {
      status: 0,
      kind: "offline",
      cause,
    });
  }

  if (response.ok) {
    // 204/empty bodies are valid successes.
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      // Non-JSON 200 (rare for our API) — hand the raw text back.
      return text as unknown as T;
    }
  }

  // Error path: pull the server's `{ error }` message when present.
  const kind = kindForStatus(response.status);
  let serverMessage: string | undefined;
  let code: string | undefined;
  try {
    const data = (await response.json()) as { error?: unknown; code?: unknown };
    if (typeof data?.error === "string" && data.error.trim()) {
      serverMessage = data.error.trim();
    }
    if (typeof data?.code === "string") code = data.code;
  } catch {
    // No/!JSON body — fall through to the kind-based fallback.
  }

  // Trust the server's wording in almost every case: our API routes only ever
  // return curated `{ error }` strings (raw exceptions are logged server-side
  // and replaced with a safe message by `handleApiError`), so the server line
  // is the most specific *and* safe thing to show — including for 5xx, where
  // the AI routes surface real reasons like "AI parsing is not configured".
  // The two exceptions: a bare "Unauthorized" 401 (we prefer our re-auth copy)
  // and offline (there is no server message).
  const isBareUnauthorized =
    kind === "auth" && (!serverMessage || /^unauthorized$/i.test(serverMessage));
  const useServerMessage = serverMessage && kind !== "offline" && !isBareUnauthorized;

  const message = useServerMessage ? serverMessage! : FALLBACK_BY_KIND[kind];

  throw new ApiError(message, {
    status: response.status,
    kind,
    serverMessage,
    code,
  });
}

/**
 * Normalize anything caught in a `catch` into a user-facing string. Use this
 * at the boundary where you show an error (toast, inline text) so callers don't
 * each re-implement the `err instanceof Error ? err.message : "…"` dance.
 */
export function getErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") {
    return "That took too long and was cancelled.";
  }
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

/** True when the error is one a retry might actually fix. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.kind === "offline" || error.kind === "server" || error.kind === "rateLimit";
  }
  return false;
}

/** True when the failure means the user needs to re-authenticate. */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "auth";
}
