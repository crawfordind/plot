"use client";

import { useEffect, useState } from "react";
import type { CoachSnapshot } from "@/lib/coach/insights";

type CoachPanelProps = {
  selectedLocationId: string | null;
  onStarterSelect: (text: string) => void;
  refreshKey: number;
  hidden?: boolean;
};

export default function CoachPanel({
  selectedLocationId,
  onStarterSelect,
  refreshKey,
  hidden,
}: CoachPanelProps) {
  const [coach, setCoach] = useState<CoachSnapshot | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedLocationId) params.set("locationId", selectedLocationId);

    fetch(`/api/coach?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.coach) setCoach(data.coach);
      })
      .catch(() => {});
  }, [selectedLocationId, refreshKey]);

  if (!coach || hidden) return null;

  return (
    // Sits below the FarmBar pill (also pinned top-left) so the two don't overlap.
    <div className="absolute left-3 right-14 top-16 z-10">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-emerald-100 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur active:bg-emerald-50"
      >
        <div className="min-w-0 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Coach
          </p>
          <p className="truncate text-sm font-medium text-stone-800">
            {coach.seasonLabel}
            {coach.loggingStreak > 0 && ` · ${coach.loggingStreak}d streak`}
          </p>
        </div>
        <span className="shrink-0 text-xs text-stone-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-emerald-100 bg-white/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap gap-2 text-xs text-stone-500">
            <span>{coach.logsThisWeek} this week</span>
            <span>{coach.seasonCompleteness}% season</span>
          </div>

          <ul className="mt-2 space-y-2">
            {coach.insights.map((insight) => (
              <li key={insight.id}>
                <p className="text-sm leading-snug text-stone-700">{insight.message}</p>
                {insight.logStarter && (
                  <button
                    type="button"
                    onClick={() => onStarterSelect(insight.logStarter!)}
                    className="mt-1 text-sm font-medium text-emerald-700 active:text-emerald-900"
                  >
                    Use starter →
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
