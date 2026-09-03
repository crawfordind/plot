import type { HeightUnit } from "@/lib/types";

// Heights are ALWAYS stored in centimetres. The org's `heightUnit` decides only
// what the field UI shows and steps by, so a farm can switch between cm and
// inches whenever it likes and every historical number stays comparable — no
// migration, no re-entry, and a CSV that means the same thing across farms.

export type { HeightUnit };

export const HEIGHT_UNITS: HeightUnit[] = ["cm", "in"];

const CM_PER_INCH = 2.54;

export function cmToDisplay(cm: number, unit: HeightUnit): number {
  return unit === "in" ? cm / CM_PER_INCH : cm;
}

export function displayToCm(value: number, unit: HeightUnit): number {
  return unit === "in" ? value * CM_PER_INCH : value;
}

// What one press of the +/− stepper is worth. A gloved thumb wants a step big
// enough to matter on a tree that grows tens of centimetres a season, so this is
// deliberately coarse: type the exact number only when it matters.
export function stepFor(unit: HeightUnit): number {
  return unit === "in" ? 1 : 5;
}

export function unitLabel(unit: HeightUnit): string {
  return unit === "in" ? "in" : "cm";
}

// Display rounding: whole centimetres, or inches to one decimal (an inch is
// coarse enough that halves carry real information).
export function roundForUnit(value: number, unit: HeightUnit): number {
  return unit === "in" ? Math.round(value * 10) / 10 : Math.round(value);
}

// A stored height rendered for the current farm, e.g. "138 cm" or "54.3 in".
export function formatHeight(
  cm: number | null | undefined,
  unit: HeightUnit,
): string {
  if (cm == null) return "—";
  return `${roundForUnit(cmToDisplay(cm, unit), unit)} ${unitLabel(unit)}`;
}

// A growth delta, signed, for the "+41 cm this season" line.
export function formatHeightDelta(
  deltaCm: number | null | undefined,
  unit: HeightUnit,
): string {
  if (deltaCm == null) return "—";
  const value = roundForUnit(cmToDisplay(deltaCm, unit), unit);
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} ${unitLabel(unit)}`;
}

// Clamp a typed/stepped height to something a tree tube can plausibly hold.
// 0 is legitimate (browsed to the ground); 30 m is well past any tube.
export const MAX_HEIGHT_CM = 3000;

export function clampHeightCm(cm: number): number {
  if (!Number.isFinite(cm)) return 0;
  return Math.min(Math.max(cm, 0), MAX_HEIGHT_CM);
}
