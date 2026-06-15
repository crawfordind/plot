"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { getSeasonLabel } from "@/lib/coach/season";
import type { LocationRecord } from "@/lib/types";

// The unified bottom dock: one input that both logs activity and talks to the
// farm assistant. It doesn't parse or save anything itself — sending hands the
// text to the agentic chat (see ExpertChat), which decides whether to log it
// (proposing a confirm card) or just answer. "Talking to it" expands the bar
// into the full conversation.
type ChatDockProps = {
  locations: LocationRecord[];
  selectedLocationId: string | null;
  // Open the chat with this text auto-sent.
  onSend: (text: string) => void;
  // Fallback to the precise manual event form.
  onManualForm: () => void;
  // Pre-fill from the Coach (a tapped suggestion). Expands the dock for editing.
  starterText?: string;
  onStarterConsumed?: () => void;
  // Collapsed = a slim pill; expanded = the input. Controlled by the map so it
  // can tuck the dock away during map actions.
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export default function ChatDock({
  locations,
  selectedLocationId,
  onSend,
  onManualForm,
  starterText,
  onStarterConsumed,
  collapsed: collapsedProp,
  onCollapsedChange,
}: ChatDockProps) {
  const [text, setText] = useState("");
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
    // Sync an external starter prompt (tapped from the Coach) into the editor —
    // prop→state sync driven by a parent action, not a render cascade.
    if (!starterText) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setText(starterText);
    setCollapsed(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    onStarterConsumed?.();
  }, [starterText, onStarterConsumed, setCollapsed]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
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
            Log or ask anything…
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
        Log an activity or ask the farm assistant — it can do both.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-2 space-y-2 pb-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          enterKeyHint="send"
          placeholder={
            selectedLocation
              ? `What happened at ${selectedLocation.name}? Or ask anything…`
              : "Log what happened, or ask the farm assistant…"
          }
          className="w-full resize-none rounded-2xl border border-stone-200 px-4 py-3 outline-none focus:border-emerald-500"
        />

        <Button
          type="submit"
          size="lg"
          fullWidth
          leftIcon="send"
          disabled={!text.trim()}
        >
          Send
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
