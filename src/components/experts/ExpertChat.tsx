"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Icon from "@/components/ui/Icon";
import { EXPERTS, EXPERT_BY_ID, type Expert, type ExpertId } from "@/lib/experts/personas";

type ExpertChatProps = {
  open: boolean;
  onClose: () => void;
};

type UserTurn = { role: "user"; content: string };
type AssistantTurn = { role: "assistant"; answers: { expertId: ExpertId; text: string }[] };
type Turn = UserTurn | AssistantTurn;

// Static Tailwind classes per accent (kept literal so they survive purge).
const ACCENT: Record<
  Expert["accent"],
  { selected: string; dot: string; card: string; label: string }
> = {
  emerald: {
    selected: "border-emerald-400 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300",
    dot: "bg-emerald-500",
    card: "border-emerald-100 bg-emerald-50/40",
    label: "text-emerald-800",
  },
  amber: {
    selected: "border-amber-400 bg-amber-50 text-amber-900 ring-1 ring-amber-300",
    dot: "bg-amber-500",
    card: "border-amber-100 bg-amber-50/40",
    label: "text-amber-800",
  },
  orange: {
    selected: "border-orange-400 bg-orange-50 text-orange-900 ring-1 ring-orange-300",
    dot: "bg-orange-500",
    card: "border-orange-100 bg-orange-50/40",
    label: "text-orange-800",
  },
};

// Minimal, dependency-free renderer for the bits of markdown the model emits:
// **bold** and "- " bullet lists. Everything else is plain text.
function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function renderRich(text: string) {
  const out: React.ReactNode[] = [];
  let bullets: React.ReactNode[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`u${out.length}`} className="my-1 list-disc space-y-0.5 pl-5">
          {bullets}
        </ul>,
      );
      bullets = [];
    }
  };
  text.split("\n").forEach((line, i) => {
    const m = line.match(/^\s*[-*]\s+(.*)/);
    if (m) bullets.push(<li key={i}>{inline(m[1])}</li>);
    else {
      flush();
      if (line.trim()) out.push(<p key={i} className="my-1">{inline(line)}</p>);
    }
  });
  flush();
  return out;
}

function turnToMessage(turn: Turn): { role: "user" | "assistant"; content: string } {
  if (turn.role === "user") return { role: "user", content: turn.content };
  return {
    role: "assistant",
    content: turn.answers
      .map((a) => `${EXPERT_BY_ID[a.expertId].title}: ${a.text}`)
      .join("\n\n"),
  };
}

// A farm advisory chat: the user picks one or a few experts, each with its own
// voice and its own slice of farm context, and they reply right in the thread.
export default function ExpertChat({ open, onClose }: ExpertChatProps) {
  const [selected, setSelected] = useState<ExpertId[]>(["agronomist"]);
  const [thread, setThread] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextChips, setContextChips] = useState<string[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const selectedExperts = selected.map((id) => EXPERT_BY_ID[id]);

  const starters = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of selectedExperts) {
      for (const s of e.starters) {
        if (!seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      }
    }
    return out.slice(0, 5);
  }, [selectedExperts]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, loading]);

  function toggleExpert(id: ExpertId) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        // Never let the panel empty out.
        return prev.length === 1 ? prev : prev.filter((x) => x !== id);
      }
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading || selected.length === 0) return;

    const nextThread: Turn[] = [...thread, { role: "user", content }];
    setThread(nextThread);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/experts/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expertIds: selected,
          messages: nextThread.map(turnToMessage),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Something went wrong");
      }
      const data = (await res.json()) as {
        answers: { expertId: ExpertId; text: string }[];
        contextChips: string[];
      };
      setThread((t) => [...t, { role: "assistant", answers: data.answers }]);
      setContextChips(data.contextChips ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const empty = thread.length === 0;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      fullScreen
      title="Ask a farm expert"
      subtitle={
        selected.length > 1
          ? "Each expert answers in their own voice"
          : "Pick the experts you want to consult"
      }
    >
      <div className="flex h-full flex-col">
        {/* Expert picker */}
        <div className="shrink-0">
          <div className="flex flex-wrap gap-2">
            {EXPERTS.map((e) => {
              const on = selected.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggleExpert(e.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    on ? ACCENT[e.accent].selected : "border-stone-200 bg-white text-stone-600"
                  }`}
                >
                  <span aria-hidden>{e.emoji}</span>
                  {e.title}
                  {on && <Icon name="check" size={14} />}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-stone-400">
            {selectedExperts.map((e) => e.blurb).join("  ·  ")}
          </p>
          {contextChips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                They can see
              </span>
              {contextChips.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Thread */}
        <div
          ref={scrollerRef}
          className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-2"
        >
          {empty && (
            <div className="pt-6">
              <p className="text-center text-sm text-stone-500">
                Ask anything about your farm. Try:
              </p>
              <div className="mt-3 space-y-2">
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="block w-full rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 text-left text-sm text-stone-700 active:bg-stone-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {thread.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2 text-sm text-white">
                  {turn.content}
                </div>
              </div>
            ) : (
              <div key={i} className="space-y-2">
                {turn.answers.map((a) => {
                  const e = EXPERT_BY_ID[a.expertId];
                  const accent = ACCENT[e.accent];
                  return (
                    <div
                      key={a.expertId}
                      className={`rounded-2xl rounded-bl-md border p-3 ${accent.card}`}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        <span aria-hidden>{e.emoji}</span>
                        <span className={`text-xs font-semibold ${accent.label}`}>
                          {e.name} · {e.title}
                        </span>
                      </div>
                      <div className="text-sm leading-relaxed text-stone-700">
                        {renderRich(a.text)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ),
          )}

          {loading && (
            <div className="flex items-center gap-2 px-1 text-sm text-stone-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-transparent" />
              {selected.length > 1 ? "The panel is thinking…" : "Thinking…"}
            </div>
          )}

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-stone-100 pt-2.5 pb-safe">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder={`Ask the ${selectedExperts.map((e) => e.title.split(" ")[0]).join(" & ")}…`}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-stone-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="focus-ring touch-target flex shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow active:bg-emerald-700 disabled:opacity-40"
            >
              <Icon name="send" size={20} />
            </button>
          </form>
        </div>
      </div>
    </BottomSheet>
  );
}
