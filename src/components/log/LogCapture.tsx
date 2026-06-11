"use client";

import { useEffect, useMemo, useState } from "react";
import ParseConfirmCard from "@/components/log/ParseConfirmCard";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { getSeasonLabel } from "@/lib/coach/season";
import type { ResolvedParse } from "@/lib/parse/schema";
import type { LocationRecord, PlantingRecord } from "@/lib/types";

type LogCaptureProps = {
  locations: LocationRecord[];
  plantings: PlantingRecord[];
  selectedLocationId: string | null;
  onSaved: (coachMessage?: string) => void;
  onManualForm: () => void;
  starterText?: string;
  onStarterConsumed?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

type ParseState = {
  rawText: string;
  resolved: ResolvedParse;
  additionalResolved: ResolvedParse[];
  coachTip?: string;
};

const quickStarters = [
  { label: "Sow", text: "Sowed  in  today" },
  { label: "Water", text: "Watered  at  today" },
  { label: "Harvest", text: "Harvested  from  today — " },
  { label: "Observe", text: "Observed  at : " },
  { label: "Sale", text: "Sold  at market for $" },
];

export default function LogCapture({
  locations,
  plantings,
  selectedLocationId,
  onSaved,
  onManualForm,
  starterText,
  onStarterConsumed,
  collapsed: collapsedProp,
  onCollapsedChange,
}: LogCaptureProps) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [pendingRawText, setPendingRawText] = useState("");
  const [parseState, setParseState] = useState<ParseState | null>(null);
  const [collapsedInternal, setCollapsedInternal] = useState(false);

  const collapsed = collapsedProp ?? collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;

  const selectedLocation = locations.find((l) => l.id === selectedLocationId) ?? null;

  const contextLine = useMemo(() => {
    const parts = [getSeasonLabel()];
    if (selectedLocation) parts.push(selectedLocation.name);
    return parts.join(" · ");
  }, [selectedLocation]);

  useEffect(() => {
    if (!starterText) return;
    setText(starterText);
    setCollapsed(false);
    onStarterConsumed?.();
  }, [starterText, onStarterConsumed, setCollapsed]);

  async function runParse(rawText: string, answer?: string) {
    setParsing(true);
    setError(null);

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          selectedLocationId: selectedLocationId ?? undefined,
          clarification: answer,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Parse failed");
      }

      if (data.resolved.clarifyingQuestion && !answer) {
        setPendingRawText(rawText);
        setClarification(data.resolved.clarifyingQuestion);
        return;
      }

      setClarification(null);
      setClarificationAnswer("");
      setPendingRawText("");
      setParseState({
        rawText,
        resolved: data.resolved,
        additionalResolved: data.additionalResolved ?? [],
        coachTip: data.coachTip,
      });
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || parsing) return;
    runParse(text.trim());
  }

  function handleClarificationSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = pendingRawText || text.trim();
    if (!raw || !clarificationAnswer.trim()) return;
    runParse(raw, clarificationAnswer.trim());
  }

  function applyQuickStarter(template: string) {
    setCollapsed(false);
    const location = selectedLocation?.name ?? "";
    const planting = plantings.find((p) => p.locationId === selectedLocationId);
    const plant = planting
      ? `${planting.commonName}${planting.variety ? ` ${planting.variety}` : ""}`
      : "";

    const filled = template
      .replace("  ", plant ? `${plant} ` : "")
      .replace(" at  ", location ? ` at ${location} ` : " ")
      .replace(" in  ", location ? ` in ${location} ` : " ")
      .replace(" from  ", location ? ` from ${location} ` : " ")
      .trim();

    setText(filled);
  }

  if (parseState) {
    return (
      <ParseConfirmCard
        rawText={parseState.rawText}
        resolved={parseState.resolved}
        additionalResolved={parseState.additionalResolved}
        coachTip={parseState.coachTip}
        locations={locations}
        plantings={plantings}
        onConfirm={(saveTip) => {
          setParseState(null);
          onSaved(saveTip);
        }}
        onCancel={() => setParseState(null)}
      />
    );
  }

  if (collapsed) {
    return (
      <div className="shrink-0 border-t border-emerald-100 bg-white px-safe pb-safe">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="focus-ring touch-target my-2 flex w-full items-center justify-between rounded-2xl bg-emerald-600 px-4 py-3 text-left text-white shadow-md active:bg-emerald-700"
        >
          <span className="flex items-center gap-2 text-base font-semibold">
            <Icon name="sparkle" size={18} />
            Log something…
          </span>
          <span className="text-sm opacity-80">Tap to open</span>
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-emerald-100 bg-white px-safe pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between gap-2 pt-2">
        <p className="min-w-0 truncate text-xs font-medium text-emerald-800">{contextLine}</p>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-stone-400 active:bg-stone-100"
        >
          Minimize
        </button>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-stone-400">
        <Icon name="sparkle" size={12} className="text-emerald-500" />
        Type naturally — Plot sorts out the action, plant, and place.
      </p>

      {clarification && (
        <form
          onSubmit={handleClarificationSubmit}
          className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
        >
          <p className="text-sm font-medium text-amber-900">{clarification}</p>
          <input
            autoFocus
            value={clarificationAnswer}
            onChange={(e) => setClarificationAnswer(e.target.value)}
            placeholder="Your answer…"
            className="mt-2 w-full rounded-xl border border-amber-200 px-3 py-3 outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={parsing || !clarificationAnswer.trim()}
            className="touch-target mt-2 w-full rounded-xl bg-amber-600 text-sm font-semibold text-white disabled:opacity-50"
          >
            Continue
          </button>
        </form>
      )}

      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {quickStarters.map((starter) => (
          <button
            key={starter.label}
            type="button"
            onClick={() => applyQuickStarter(starter.text)}
            className="shrink-0 rounded-full border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 active:bg-emerald-50 active:text-emerald-800"
          >
            {starter.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-2 space-y-2 pb-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          enterKeyHint="send"
          placeholder={
            selectedLocation
              ? `What happened at ${selectedLocation.name}?`
              : "What happened in the field?"
          }
          className="w-full resize-none rounded-2xl border border-stone-200 px-4 py-3 outline-none focus:border-emerald-500"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={parsing}
          leftIcon="sparkle"
          disabled={parsing || !text.trim()}
        >
          {parsing ? "Understanding…" : "Log it"}
        </Button>
      </form>

      <button
        type="button"
        onClick={onManualForm}
        className="mb-1 w-full py-2 text-center text-sm text-stone-400 active:text-stone-600"
      >
        Manual form
      </button>
    </div>
  );
}
