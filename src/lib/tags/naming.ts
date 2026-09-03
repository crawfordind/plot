// Auto-numbered run names. Naming 400 tubes by hand is the single biggest piece
// of friction in a planting day, so the bind sheet always arrives pre-filled:
// the name is editable but never required, and it keeps counting so a crew never
// types on a cold morning.

const TRAILING_NUMBER = /^(.*?)(\d+)(\D*)$/;

// "Oak 214" → "Oak 215". Zero padding is preserved ("Row 007" → "Row 008") so a
// numbering scheme a farm already uses on paper survives contact with the app.
export function nextRunName(previous: string): string {
  const match = TRAILING_NUMBER.exec(previous.trim());
  if (!match) return `${previous.trim()} 2`.trim();

  const [, prefix, digits, suffix] = match;
  const next = String(Number(digits) + 1);
  const padded = digits.startsWith("0")
    ? next.padStart(digits.length, "0")
    : next;
  return `${prefix}${padded}${suffix}`;
}

// The opening name for a fresh run, from whatever the crew is planting. Falls
// back to a generic marker so the field never blocks on a species nobody
// bothered to enter.
export function firstRunName(commonName?: string | null): string {
  const base = commonName?.trim();
  if (!base) return "Tube 1";
  // "Bur oak" → "Bur oak 1"; a crew renames the run once and the counter does
  // the rest.
  return `${base} 1`;
}
