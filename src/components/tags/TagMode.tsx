"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import NfcTarget from "@/components/tags/NfcTarget";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import { generateTagCode } from "@/lib/tags/code";
import { firstRunName, nextRunName } from "@/lib/tags/naming";
import { buzz, startScanning, writeTag } from "@/lib/tags/nfc";
import { useNfcSupported } from "@/lib/tags/useCapability";
import { useLiveFix } from "@/lib/tags/useLiveFix";
import type {
  LocationRecord,
  PlantingRecord,
  TagRecord,
  TagScope,
} from "@/lib/types";

// Field-encode: a blank tag becomes a tube, one-handed.
//
// Encoding at the moment of planting (rather than at a desk beforehand) means
// the tag's identity and its GPS fix are the same event, and the tag is already
// in the crew's hand. The cost is that everything has to work with gloves on, in
// sun, with no signal — hence the full-screen target, the pre-filled sheet, and
// the 60px "Next tag".

type Phase = "arming" | "binding" | "written";

type ScopeOption = { id: TagScope; label: string };
const SCOPES: ScopeOption[] = [
  { id: "tube", label: "One tube" },
  { id: "row", label: "A row" },
  { id: "block", label: "A block" },
];

// Carried across a whole session so the happy path is one thumb press: the crew
// enters species and lot once, and every later tube inherits them.
type RunState = {
  count: number;
  startedAt: number;
  name: string;
  commonName: string;
  variety: string;
  source: string;
  lot: string;
  scope: TagScope;
};

// Mounted only while tag mode is armed (the parent renders it conditionally),
// so closing it genuinely ends the session — the run counter, the carried
// species and the reader subscription all reset together rather than lingering
// behind a hidden prop.
type TagModeProps = {
  onClose: () => void;
  // The block/field the run belongs to; new tubes nest under it.
  parentId: string | null;
  parentName: string | null;
  // Reported so the map and record list pick up the new tube immediately.
  onTagWritten: (result: {
    tag: TagRecord;
    location: LocationRecord | null;
    planting: PlantingRecord | null;
  }) => void;
  // A tag that already carries one of our codes isn't a blank — hand it to the
  // scan landing instead of trying to overwrite a locked chip.
  onKnownTagScanned: (code: string) => void;
};

export default function TagMode({
  onClose,
  parentId,
  parentName,
  onTagWritten,
  onKnownTagScanned,
}: TagModeProps) {
  const toast = useToast();
  const supported = useNfcSupported();
  const [phase, setPhase] = useState<Phase>("arming");
  const [scanError, setScanError] = useState<string | null>(null);
  const [chipUid, setChipUid] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  // Snapshotted at the moment of the write rather than read during render: the
  // confirm screen reports the session as it stood when the tag took, and the
  // minute counter doesn't tick while a crew stands looking at it.
  const [lastWritten, setLastWritten] = useState<{
    name: string;
    lat: number | null;
    lng: number | null;
    minutes: number;
  } | null>(null);

  // Lazy initialiser: the session clock starts when tag mode is actually armed,
  // and never re-reads the wall clock on a re-render.
  const [run, setRun] = useState<RunState>(() => ({
    count: 0,
    startedAt: Date.now(),
    name: "",
    commonName: "",
    variety: "",
    source: "",
    lot: "",
    scope: "tube",
  }));

  const { fix, error: fixError } = useLiveFix(true);
  const sessionRef = useRef<{ stop: () => void } | null>(null);

  // A blank tag has arrived. Pre-filling the name here (rather than in an
  // effect watching the phase) keeps it an event: it happens once per chip, at
  // the moment the chip answers, and never on a keystroke in the sheet.
  const beginBind = useCallback(
    (uid: string | null) => {
      setChipUid(uid);
      setScanError(null);
      setRun((r) => ({
        ...r,
        name: r.name ? nextRunName(r.name) : firstRunName(r.commonName || parentName),
      }));
      setPhase("binding");
    },
    [parentName],
  );

  // Keep one scan session open for the whole walk: one permission prompt, then
  // scan-walk-scan. Re-arming per tube would put a prompt at every tree.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    void (async () => {
      try {
        const session = await startScanning({
          onTag: (tag) => {
            buzz();
            if (tag.code) {
              // Already ours and already locked — a visit, not a write.
              onKnownTagScanned(tag.code);
              return;
            }
            beginBind(tag.chipUid);
          },
          onError: (message) => setScanError(message),
        });
        if (cancelled) session.stop();
        else sessionRef.current = session;
      } catch (error) {
        setScanError(getErrorMessage(error));
      }
    })();

    return () => {
      cancelled = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [supported, onKnownTagScanned, beginBind]);

  async function writeAndBind() {
    setWriting(true);
    const code = generateTagCode();
    try {
      // Order matters. The record is committed FIRST, because a locked chip
      // pointing at nothing is scrap, while a record with no tag is just an
      // untagged tube someone can re-tag tomorrow.
      const result = await apiFetch<{
        tag: TagRecord;
        location: LocationRecord | null;
        planting: PlantingRecord | null;
      }>("/api/tags", {
        method: "POST",
        body: {
          tagCode: code,
          ...(chipUid ? { chipUid } : {}),
          scope: run.scope,
          name: run.name.trim() || firstRunName(run.commonName),
          ...(parentId ? { parentId } : {}),
          ...(fix ? { lat: fix.lat, lng: fix.lng } : {}),
          ...(run.commonName.trim()
            ? {
                planting: {
                  commonName: run.commonName.trim(),
                  ...(run.variety.trim() ? { variety: run.variety.trim() } : {}),
                  ...(run.source.trim() || run.lot.trim()
                    ? {
                        source: [run.source.trim(), run.lot.trim()]
                          .filter(Boolean)
                          .join(" · "),
                      }
                    : {}),
                },
              }
            : {}),
        },
      });

      // Only now write and lock the chip. makeReadOnly() cannot be undone.
      await writeTag(code, window.location.origin);
      buzz([40, 60, 40]);

      onTagWritten(result);
      setLastWritten({
        name: run.name.trim() || result.location?.name || "Tube",
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        minutes: Math.max(1, Math.round((Date.now() - run.startedAt) / 60000)),
      });
      setRun((r) => ({ ...r, count: r.count + 1 }));
      setPhase("written");
    } catch (error) {
      toast.error("That tag didn't take", { description: getErrorMessage(error) });
    } finally {
      setWriting(false);
    }
  }

  // ─── Confirm ──────────────────────────────────────────────────────────────
  if (phase === "written" && lastWritten) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-emerald-600 px-7 pb-safe pt-safe text-white">
        <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-white/15">
          <Icon name="check" size={46} strokeWidth={2} />
        </span>
        <p className="mt-6 text-center text-[28px] font-bold">
          {lastWritten.name} tagged
        </p>
        <p className="mt-2 max-w-[280px] text-center text-base leading-snug opacity-85">
          Written, locked
          {lastWritten.lat != null && lastWritten.lng != null
            ? ` and pinned at ${lastWritten.lat.toFixed(4)}, ${lastWritten.lng.toFixed(4)}.`
            : ". No GPS fix, so it has no pin yet."}
        </p>

        <div className="mt-6 w-full rounded-[20px] bg-white/15 px-4 py-3.5">
          <div className="flex justify-between text-sm font-medium opacity-90">
            <span>This session</span>
            <span>
              {run.count} {run.count === 1 ? "tube" : "tubes"} ·{" "}
              {lastWritten.minutes} min
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setChipUid(null);
            setPhase("arming");
          }}
          className="focus-ring mt-6 min-h-[60px] w-full rounded-[18px] bg-white text-lg font-bold text-emerald-800"
        >
          Next tag
        </button>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring mt-2.5 min-h-[44px] w-full text-sm text-white/70"
        >
          Done for now
        </button>
      </div>
    );
  }

  // ─── Bind ─────────────────────────────────────────────────────────────────
  if (phase === "binding") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end">
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => setPhase("arming")}
          className="absolute inset-0 bg-black/50"
        />
        <div className="sheet-enter relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl">
          <div className="flex shrink-0 justify-center pt-2">
            <div className="h-1 w-10 rounded-full bg-stone-300" />
          </div>
          <div className="shrink-0 border-b border-stone-100 px-4 pb-3 pt-2">
            <h2 className="text-lg font-semibold text-stone-900">
              Blank tag — what is it?
            </h2>
            <p className="mt-0.5 font-mono text-xs text-stone-500">
              {chipUid ?? "UID not exposed by this reader"}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div
              className={`flex gap-2.5 rounded-2xl border px-3 py-2.5 ${
                fix
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <span className="mt-0.5 shrink-0">
                <Icon name="gps" size={18} />
              </span>
              <div className="text-sm leading-snug">
                {fix ? (
                  <>
                    <p className="font-semibold">
                      GPS locked
                      {fix.accuracy != null && ` · ±${Math.round(fix.accuracy)} m`}
                    </p>
                    <p className="mt-0.5">
                      {parentName ? (
                        <>
                          Inside <b>{parentName}</b>. The pin drops where
                          you&rsquo;re standing.
                        </>
                      ) : (
                        "The pin drops where you're standing."
                      )}
                    </p>
                  </>
                ) : (
                  <p>{fixError ?? "Waiting for a GPS fix…"}</p>
                )}
              </div>
            </div>

            <span className="mt-4 block text-xs font-medium text-stone-600">
              This tag marks
            </span>
            <div className="mt-1.5 flex gap-1">
              {SCOPES.map((scope) => {
                const active = run.scope === scope.id;
                return (
                  <button
                    key={scope.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRun((r) => ({ ...r, scope: scope.id }))}
                    className={`focus-ring rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? "bg-emerald-600 text-white"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {scope.label}
                  </button>
                );
              })}
            </div>

            <span className="mt-4 block text-xs font-medium text-stone-600">
              Species &amp; source stock
            </span>
            <Input
              value={run.commonName}
              onChange={(e) => setRun((r) => ({ ...r, commonName: e.target.value }))}
              placeholder="Bur oak"
              className="mt-1"
              autoComplete="off"
            />
            <div className="mt-2 flex gap-2">
              <Input
                value={run.source}
                onChange={(e) => setRun((r) => ({ ...r, source: e.target.value }))}
                placeholder="Nursery 2-0 bare root"
                autoComplete="off"
              />
              <Input
                value={run.lot}
                onChange={(e) => setRun((r) => ({ ...r, lot: e.target.value }))}
                placeholder="Lot"
                className="w-[104px] shrink-0"
                autoComplete="off"
              />
            </div>

            <span className="mt-4 block text-xs font-medium text-stone-600">Name</span>
            <div className="mt-1 flex items-center gap-2">
              <Input
                value={run.name}
                onChange={(e) => setRun((r) => ({ ...r, name: e.target.value }))}
                className="border-emerald-200"
                autoComplete="off"
              />
              {run.count > 0 && (
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
                  auto ▸ next in run
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-stone-400">
              Names keep counting so a crew never types on a cold morning.
            </p>

            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-[13px] leading-snug text-sky-900">
              Writes a Plot URL to the tag, then locks it read-only. That
              can&rsquo;t be undone — re-binding later is a manager action, not a
              second write in the field.
            </div>
          </div>

          <div className="shrink-0 border-t border-stone-100 px-4 py-3 pb-safe">
            <Button
              size="lg"
              fullWidth
              leftIcon="nfc"
              loading={writing}
              onClick={writeAndBind}
              className="min-h-[52px] rounded-2xl text-base"
            >
              Write tag &amp; plant
            </Button>
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setPhase("arming")}
              className="mt-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Arm ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close tag mode"
        onClick={onClose}
        className="absolute inset-0 bg-stone-950/55"
      />
      <div className="sheet-enter relative flex w-full flex-col items-center rounded-t-3xl bg-white px-5 pb-safe pt-2">
        <div className="h-1 w-10 rounded-full bg-stone-300" />

        {supported ? (
          <>
            <div className="mt-8">
              <NfcTarget />
            </div>
            <p className="mt-6 text-center text-[22px] font-semibold text-stone-900">
              Hold the phone to the tag
            </p>
            <p className="mt-2 max-w-[290px] text-center text-[15px] leading-snug text-stone-500">
              Top of the tube, back of the phone. Keep it there until it buzzes.
            </p>
          </>
        ) : (
          <>
            <div className="mt-8 flex h-[132px] w-[132px] items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <Icon name="warning" size={52} />
            </div>
            <p className="mt-6 text-center text-[22px] font-semibold text-stone-900">
              No NFC on this device
            </p>
            <p className="mt-2 max-w-[300px] text-center text-[15px] leading-snug text-stone-500">
              Web NFC is Android Chrome only. Every tube also carries a printed QR
              of the same id, so an iPhone walks the same rows.
            </p>
          </>
        )}

        {scanError && (
          <p className="mt-3 max-w-[300px] text-center text-[13px] text-amber-700">
            {scanError}
          </p>
        )}

        {run.count > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-full bg-stone-100 px-3.5 py-2 text-[13px] font-medium text-stone-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {run.count} written this session
          </div>
        )}

        <div className="mt-5 flex w-full flex-col gap-2 pb-5">
          <Button
            variant="subtle"
            size="lg"
            fullWidth
            onClick={onClose}
            className="min-h-[52px]"
          >
            Scan a QR label instead
          </Button>
          <Button variant="ghost" fullWidth onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
