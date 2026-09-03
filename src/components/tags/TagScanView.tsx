"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import Icon from "@/components/ui/Icon";
import { formatHeight, formatHeightDelta } from "@/lib/tags/units";
import type { EventRecord, TagResolution } from "@/lib/types";

// The scan landing. Identity hero, then the only two things anyone actually
// does standing at a tube — log a visit, take a photo — as 74px targets.
// Everything else (growth, history, map, full record) sits below the fold:
// reachable, never in the way.

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Growing seasons elapsed since planting, counted inclusively — "2nd season" is
// how a crew talks about a tree in the year after it went in.
function seasonsSince(iso: string | null): number | null {
  if (!iso) return null;
  const planted = new Date(iso);
  if (Number.isNaN(planted.getTime())) return null;
  const years = new Date().getFullYear() - planted.getFullYear();
  return Math.max(1, years + 1);
}

function ordinal(n: number): string {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function visitLine(visit: EventRecord, unit: TagResolution["heightUnit"]): string {
  const parts = ["Visit"];
  if (visit.heightCm != null) parts.push(formatHeight(visit.heightCm, unit));
  if (visit.survival) parts.push(visit.survival);
  return parts.join(" · ");
}

type TagScanViewProps = {
  resolution: TagResolution;
  onLogVisit: () => void;
  onTakePhoto?: () => void;
  onShowOnMap?: () => void;
  onOpenRecord?: () => void;
};

export default function TagScanView({
  resolution,
  onLogVisit,
  onTakePhoto,
  onShowOnMap,
  onOpenRecord,
}: TagScanViewProps) {
  const { tag, location, planting, recentVisits, growth, heightUnit } = resolution;

  const latest = recentVisits[0] ?? null;
  const plantedAt = planting?.sownAt ?? planting?.transplantedAt ?? null;
  const season = seasonsSince(plantedAt);

  // Growth this season: the change since the first reading taken in the current
  // calendar year, which is the number a crew is actually asking about.
  const seasonGrowthCm = useMemo(() => {
    if (growth.length < 2) return null;
    const year = new Date().getFullYear();
    const thisYear = growth.filter(
      (p) => new Date(p.occurredAt).getFullYear() === year,
    );
    const series = thisYear.length >= 2 ? thisYear : growth;
    return series[series.length - 1].heightCm - series[0].heightCm;
  }, [growth]);

  const maxHeight = useMemo(
    () => growth.reduce((max, p) => Math.max(max, p.heightCm), 0),
    [growth],
  );

  const recentDamage = latest?.damage ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <header className="shrink-0 bg-emerald-900 px-5 pb-5 pt-safe text-white">
        <div className="flex items-center gap-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] opacity-75">
          <Icon name="nfc" size={14} strokeWidth={2} />
          {tag.kind === "qr" ? "QR read" : "Tag read"}
        </div>
        <h1 className="mt-2.5 text-[34px] font-bold leading-[1.05] tracking-tight">
          {location.name}
        </h1>
        <p className="mt-2 text-[15px] opacity-85">
          {[
            planting?.commonName,
            location.zone,
            plantedAt ? `planted ${longDate(plantedAt)}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No planting recorded yet"}
        </p>
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {latest?.survival && (
            <Badge tone={latest.survival === "alive" ? "emerald" : "stone"} dot>
              {latest.survival === "alive"
                ? "Alive"
                : latest.survival === "dead"
                  ? "Dead"
                  : "Missing"}
            </Badge>
          )}
          {season && (
            <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
              {ordinal(season)} season
            </span>
          )}
          {recentDamage.length > 0 && (
            <Badge tone="amber">
              {recentDamage.includes("browse") ? "Browse seen" : "Damage seen"}
            </Badge>
          )}
          {tag.status !== "active" && <Badge tone="red">Tag {tag.status}</Badge>}
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-2.5 px-5 pt-4">
        <button
          type="button"
          onClick={onLogVisit}
          className="focus-ring flex min-h-[74px] w-full items-center justify-center gap-2.5 rounded-[20px] bg-emerald-600 text-xl font-bold text-white active:bg-emerald-700"
        >
          <Icon name="calendar" size={24} />
          Log a visit
        </button>
        <button
          type="button"
          onClick={onTakePhoto}
          disabled={!onTakePhoto}
          className="focus-ring flex min-h-[74px] w-full items-center justify-center gap-2.5 rounded-[20px] border border-emerald-200 bg-emerald-50 text-xl font-bold text-emerald-800 active:bg-emerald-100 disabled:opacity-40"
        >
          <Icon name="camera" size={24} />
          Take a photo
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4">
        {growth.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-stone-400">
                Growth
              </h2>
              {seasonGrowthCm != null && (
                <span className="text-xs font-medium text-emerald-700">
                  {formatHeightDelta(seasonGrowthCm, heightUnit)} this season
                </span>
              )}
            </div>
            <div className="mt-2.5 flex h-[88px] items-end gap-1.5">
              {growth.map((point, i) => (
                <span
                  key={`${point.occurredAt}-${i}`}
                  title={`${formatHeight(point.heightCm, heightUnit)} · ${shortDate(point.occurredAt)}`}
                  className="flex-1 rounded-t bg-emerald-500"
                  style={{
                    height: `${maxHeight > 0 ? Math.max(6, (point.heightCm / maxHeight) * 100) : 6}%`,
                    // Later readings sit darker, so the curve reads as a
                    // direction and not just a row of bars.
                    opacity: 0.45 + (0.55 * (i + 1)) / growth.length,
                  }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[11px] text-stone-400">
              <span>{shortDate(growth[0].occurredAt)}</span>
              <span>{shortDate(growth[growth.length - 1].occurredAt)}</span>
            </div>
          </section>
        )}

        <section className={growth.length > 0 ? "mt-5" : ""}>
          <h2 className="text-xs font-semibold uppercase tracking-[0.05em] text-stone-400">
            {recentVisits.length > 0 ? `Last ${recentVisits.length} visits` : "Visits"}
          </h2>
          {recentVisits.length === 0 ? (
            <p className="mt-2 rounded-xl bg-stone-50 p-3 text-sm text-stone-500">
              Nothing logged here yet. The first visit sets the baseline every later
              measurement is compared against.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-2 pb-4">
              {recentVisits.map((visit) => (
                <div key={visit.id} className="rounded-xl bg-stone-50 px-3 py-2.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-sm font-medium capitalize text-emerald-800">
                      {visitLine(visit, heightUnit)}
                    </span>
                    <span className="shrink-0 text-xs text-stone-400">
                      {shortDate(visit.occurredAt)}
                    </span>
                  </div>
                  {visit.notes && (
                    <p className="mt-0.5 text-[13px] text-stone-600">{visit.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-emerald-100 bg-white px-4 py-2.5 pb-safe">
        <button
          type="button"
          onClick={onShowOnMap}
          disabled={!onShowOnMap}
          className="focus-ring min-h-[44px] flex-1 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 disabled:opacity-40"
        >
          Show on map
        </button>
        <button
          type="button"
          onClick={onOpenRecord}
          disabled={!onOpenRecord}
          className="focus-ring min-h-[44px] flex-1 rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-700 disabled:opacity-40"
        >
          Full record
        </button>
      </div>
    </div>
  );
}
