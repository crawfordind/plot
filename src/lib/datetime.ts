// Helpers for moving between a stored UTC timestamp (ISO 8601, what the API and
// DB use) and the value a native <input type="datetime-local"> expects, which is
// a *local* wall-clock string with NO timezone ("YYYY-MM-DDTHH:mm").
//
// The bug this fixes: code used `iso.slice(0, 16)` to feed the input, which drops
// the trailing "Z" and shows the UTC wall-clock as if it were local. Saving then
// reparsed that naive string as local and re-serialized to UTC, double-shifting
// by the timezone offset — so the same event read 12:29 AM in one sheet and
// 04:29 AM in another. Convert through the local timezone in both directions.

const pad = (n: number) => String(n).padStart(2, "0");

// UTC ISO timestamp → "YYYY-MM-DDTHH:mm" in the viewer's local timezone, ready to
// drop straight into a datetime-local input. Returns "" for an unparseable value.
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// A datetime-local value (local wall-clock, no tz) → UTC ISO for the API. `new
// Date("YYYY-MM-DDTHH:mm")` is interpreted in local time, which is exactly right.
export function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}
