"use client";

import Icon from "@/components/ui/Icon";
import { formatDistance } from "@/lib/capture/nearest";
import type { NearbyCandidate } from "@/lib/types";

// An unknown tag is never a dead end.
//
// A code that doesn't resolve here means one of three things: it belongs to
// another workspace, it was written before this device last synced, or the
// record it pointed at is gone. All three land a crew in the same place —
// standing at a tube with a phone that says "no". So the screen offers the two
// ways forward instead of an apology: claim it as new, or match it to a record
// close enough to be what they're actually looking at, which keeps a re-tag
// attached to its existing history rather than forking a duplicate.

type UnknownTagViewProps = {
  tagCode: string;
  nearby: NearbyCandidate[];
  farmName?: string | null;
  hasFix: boolean;
  onClaimNew?: () => void;
  onMatch?: (locationId: string) => void;
  onIgnore: () => void;
};

export default function UnknownTagView({
  tagCode,
  nearby,
  farmName,
  hasFix,
  onClaimNew,
  onMatch,
  onIgnore,
}: UnknownTagViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <header className="shrink-0 bg-amber-900 px-5 pb-5 pt-safe text-white">
        <div className="flex items-center gap-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.06em] opacity-80">
          <Icon name="warning" size={14} strokeWidth={2} />
          Unknown tag
        </div>
        <h1 className="mt-2.5 text-3xl font-bold leading-tight">Not in this farm</h1>
        <p className="mt-2 font-mono text-[13px] opacity-85">{tagCode}</p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-5 py-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-snug text-amber-900">
          This tag holds an id that isn&rsquo;t in{" "}
          <b>{farmName ?? "this workspace"}</b>. Either it belongs to another
          workspace, or it was written before this device last synced.
        </div>

        <button
          type="button"
          onClick={onClaimNew}
          disabled={!onClaimNew}
          className="focus-ring min-h-[60px] rounded-[18px] bg-emerald-600 text-[17px] font-bold text-white active:bg-emerald-700 disabled:opacity-40"
        >
          Claim as a new tube here
        </button>

        {nearby.length > 0 && (
          <div className="rounded-2xl bg-stone-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.05em] text-stone-400">
              Within {formatDistance(nearby[nearby.length - 1].meters)} of you
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              {nearby.map((candidate) => (
                <button
                  key={candidate.location.id}
                  type="button"
                  onClick={() => onMatch?.(candidate.location.id)}
                  disabled={!onMatch}
                  className="focus-ring flex min-h-[48px] w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-left text-sm text-stone-800 disabled:opacity-40"
                >
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <Icon name="tree" size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {candidate.location.name}
                    {candidate.lastTagStatus === "lost" && (
                      <span className="text-stone-400"> · tag lost</span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-medium text-stone-500">
                    {formatDistance(candidate.meters)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {nearby.length === 0 && (
          <p className="rounded-2xl bg-stone-50 p-3 text-sm leading-snug text-stone-500">
            {hasFix
              ? "No records within reach of where you're standing, so there's nothing to match this to. Claiming it as a new tube is the right move."
              : "Without a GPS fix there's nothing to rank nearby records against. Turn on location and scan again to match this tag to an existing tube."}
          </p>
        )}

        <button
          type="button"
          onClick={onIgnore}
          className="focus-ring mt-auto min-h-[44px] text-sm text-stone-400"
        >
          Ignore this tag
        </button>
      </div>
    </div>
  );
}
