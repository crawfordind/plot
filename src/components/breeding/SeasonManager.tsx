"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import type { SeasonRecord } from "@/lib/types";

function todayInput(offsetMonths = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return d.toISOString().slice(0, 10);
}

function iso(v: string): string {
  return new Date(`${v}T12:00:00`).toISOString();
}

export default function SeasonManager({
  seasons,
  onChanged,
}: {
  seasons: SeasonRecord[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [startsAt, setStartsAt] = useState(todayInput());
  const [endsAt, setEndsAt] = useState(todayInput(6));
  const [saving, setSaving] = useState(false);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [review, setReview] = useState("");

  async function add() {
    if (!label.trim() || saving) return;
    setSaving(true);
    const trimmedLabel = label.trim();
    try {
      await apiFetch<{ season: SeasonRecord }>("/api/seasons", {
        method: "POST",
        body: {
          label: trimmedLabel,
          startsAt: iso(startsAt),
          endsAt: iso(endsAt),
        },
      });
      toast.success(`${trimmedLabel} season started`);
      setLabel("");
      onChanged();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't add this season.");
      toast.error("Couldn't add season", { description: message });
    } finally {
      setSaving(false);
    }
  }

  async function closeSeason(id: string) {
    const season = seasons.find((s) => s.id === id);
    try {
      await apiFetch(`/api/seasons/${id}`, {
        method: "PATCH",
        body: { status: "closed", reviewSummary: review.trim() || null },
      });
      toast.success(`${season?.label ?? "Season"} closed`);
      setReviewFor(null);
      setReview("");
      onChanged();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't close this season.");
      toast.error("Couldn't close season", { description: message });
    }
  }

  async function reopen(id: string) {
    const season = seasons.find((s) => s.id === id);
    try {
      await apiFetch(`/api/seasons/${id}`, {
        method: "PATCH",
        body: { status: "active" },
      });
      toast.success(`${season?.label ?? "Season"} reopened`);
      onChanged();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't reopen this season.");
      toast.error("Couldn't reopen season", { description: message });
    }
  }

  async function remove(id: string) {
    const season = seasons.find((s) => s.id === id);
    try {
      await apiFetch(`/api/seasons/${id}`, { method: "DELETE" });
      toast.success(`${season?.label ?? "Season"} deleted`);
      onChanged();
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't delete this season.");
      toast.error("Couldn't delete season", { description: message });
    }
  }

  const field =
    "focus-ring rounded-xl border border-stone-200 px-3 py-2.5 text-sm";

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-2">
        <p className="text-sm font-semibold text-emerald-900">Start a season</p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. 2026 Main Season"
          className={`w-full ${field}`}
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={`flex-1 ${field}`}
          />
          <span className="text-stone-400">→</span>
          <input
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className={`flex-1 ${field}`}
          />
          <Button
            onClick={add}
            loading={saving}
            disabled={saving || !label.trim()}
            className="shrink-0"
          >
            Add
          </Button>
        </div>
      </div>

      {seasons.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No seasons yet"
          description="Define a season to group plantings and write an end-of-season review."
        />
      ) : (
        <ul className="space-y-2">
          {seasons.map((s) => (
            <li key={s.id} className="rounded-xl border border-stone-100 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-900">
                    {s.label}
                    <span
                      className={`ml-2 rounded-full px-1.5 text-[11px] font-semibold ${
                        s.status === "closed"
                          ? "bg-stone-200 text-stone-600"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {s.status}
                    </span>
                  </p>
                  <p className="text-xs text-stone-500">
                    {new Date(s.startsAt).toLocaleDateString()} –{" "}
                    {new Date(s.endsAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {s.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => setReviewFor(reviewFor === s.id ? null : s.id)}
                      className="rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-700 active:bg-stone-50"
                    >
                      Close
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => reopen(s.id)}
                      className="rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-700 active:bg-stone-50"
                    >
                      Reopen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 active:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {s.reviewSummary && (
                <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
                  {s.reviewSummary}
                </p>
              )}

              {reviewFor === s.id && (
                <div className="mt-2 space-y-2">
                  <textarea
                    autoFocus
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    rows={2}
                    placeholder="Season review — what worked, what to change next year"
                    className={`w-full ${field}`}
                  />
                  <Button fullWidth onClick={() => closeSeason(s.id)}>
                    Close season with review
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
