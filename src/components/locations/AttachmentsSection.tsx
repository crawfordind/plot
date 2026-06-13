"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentFix } from "@/lib/capture/geo";
import type { AttachmentRecord, AttachmentSource } from "@/lib/types";

type AttachmentsSectionProps = {
  locationId: string;
};

const FILE_ACCEPT =
  "image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

function kindEmoji(kind: AttachmentRecord["kind"]): string {
  if (kind === "video") return "🎬";
  if (kind === "document") return "📄";
  return "📎";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SUBJECT_LABEL: Record<string, string> = {
  crop: "Crop",
  soil: "Soil",
  pest_disease: "Pest / disease",
  weed: "Weed",
  livestock: "Livestock",
  equipment: "Equipment",
  infrastructure: "Infrastructure",
  water: "Water",
  landscape: "Landscape",
  other: "Other",
};

// Tiny status dot for the analysis lifecycle, shown on each image thumbnail.
function StatusDot({ status }: { status: AttachmentRecord["analysisStatus"] }) {
  if (status === "done") return null;
  const map = {
    pending: { c: "bg-amber-400", t: "Queued for analysis" },
    processing: { c: "bg-emerald-400 animate-pulse", t: "Analyzing…" },
    failed: { c: "bg-red-500", t: "Analysis failed" },
    done: { c: "bg-emerald-500", t: "Analyzed" },
  } as const;
  const s = map[status];
  return (
    <span
      title={s.t}
      className={`absolute left-1 top-1 h-2.5 w-2.5 rounded-full ring-2 ring-black/30 ${s.c}`}
    />
  );
}

// Photos, media and documents attached to a location, each run through the vision
// agronomist model. Camera capture records GPS + heading; gallery uploads let the
// user add context and re-analyze. Fetches its own list so it only loads when an
// asset is open.
export default function AttachmentsSection({
  locationId,
}: AttachmentsSectionProps) {
  const [items, setItems] = useState<AttachmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attachments?locationId=${locationId}`);
      if (res.ok) setItems((await res.json()).attachments);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    // Fetch this location's attachments when the open asset changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Kick off (or retry) analysis for one image, then refresh to show the result.
  const analyze = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await fetch(`/api/attachments/${id}/analyze`, { method: "POST" });
      } finally {
        setBusyId(null);
        await load();
      }
    },
    [load],
  );

  async function handleFiles(
    fileList: FileList | null,
    source: AttachmentSource,
  ) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);

    // In-app camera shots carry where the user is + which way they face.
    const fix = source === "asset_camera" ? await getCurrentFix() : null;

    const newImageIds: string[] = [];
    try {
      for (const file of Array.from(fileList)) {
        const form = new FormData();
        form.append("file", file);
        form.append("locationId", locationId);
        form.append("source", source);
        if (fix) {
          if (fix.lat !== null) form.append("lat", String(fix.lat));
          if (fix.lng !== null) form.append("lng", String(fix.lng));
          if (fix.accuracy !== null)
            form.append("gpsAccuracy", String(fix.accuracy));
          if (fix.heading !== null) form.append("heading", String(fix.heading));
          form.append("capturedAt", String(Date.now()));
        }
        const res = await fetch("/api/attachments", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Upload failed");
        }
        const { attachment } = (await res.json()) as {
          attachment: AttachmentRecord;
        };
        if (attachment.kind === "image") newImageIds.push(attachment.id);
      }
      await load();
      // Analysis is automatic: run the freshly uploaded images through the model.
      await Promise.all(newImageIds.map((id) => analyze(id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveContextAndAnalyze(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/attachments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userContext: contextDraft }),
      });
    } finally {
      setBusyId(null);
    }
    await analyze(id);
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
    await fetch(`/api/attachments/${id}`, { method: "DELETE" }).catch(() => {});
  }

  function openItem(item: AttachmentRecord) {
    if (item.kind !== "image") {
      window.open(item.url, "_blank", "noreferrer");
      return;
    }
    setSelectedId((cur) => (cur === item.id ? null : item.id));
    setContextDraft(item.userContext ?? "");
  }

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Photos &amp; files ({items.length})
        </h3>
        {uploading && <span className="text-xs text-emerald-600">Uploading…</span>}
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files, "asset_camera")}
      />
      <input
        ref={fileRef}
        type="file"
        accept={FILE_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files, "upload")}
      />

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
          className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50 disabled:opacity-50"
        >
          📷 Take photo
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50 disabled:opacity-50"
        >
          📎 Attach file
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="mt-3 py-2 text-sm text-stone-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 py-2 text-sm text-stone-400">
          No photos or files yet — take a field photo and the AI agronomist will read it.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {items.map((item) => (
            <li key={item.id} className="group relative">
              <button
                type="button"
                onClick={() => openItem(item)}
                className={`block aspect-square w-full overflow-hidden rounded-xl border bg-stone-50 text-left ${
                  selectedId === item.id
                    ? "border-emerald-500 ring-2 ring-emerald-500/30"
                    : "border-stone-200"
                }`}
                title={item.fileName}
              >
                {item.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.caption ?? item.fileName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
                    <span className="text-2xl">{kindEmoji(item.kind)}</span>
                    <span className="line-clamp-2 break-all text-[10px] leading-tight text-stone-500">
                      {item.fileName}
                    </span>
                    <span className="text-[10px] text-stone-400">
                      {formatSize(item.sizeBytes)}
                    </span>
                  </span>
                )}
              </button>
              {item.kind === "image" && (
                <StatusDot status={item.analysisStatus} />
              )}
              <button
                type="button"
                aria-label={`Delete ${item.fileName}`}
                onClick={() => remove(item.id)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-xs text-white active:bg-black/75"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && selected.kind === "image" && (
        <InsightPanel
          item={selected}
          busy={busyId === selected.id}
          contextDraft={contextDraft}
          onContextChange={setContextDraft}
          onSaveContext={() => saveContextAndAnalyze(selected.id)}
          onReanalyze={() => analyze(selected.id)}
        />
      )}
    </section>
  );
}

function InsightPanel({
  item,
  busy,
  contextDraft,
  onContextChange,
  onSaveContext,
  onReanalyze,
}: {
  item: AttachmentRecord;
  busy: boolean;
  contextDraft: string;
  onContextChange: (v: string) => void;
  onSaveContext: () => void;
  onReanalyze: () => void;
}) {
  const insight = item.insight;
  const obs = insight?.observations;
  const geoBits: string[] = [];
  if (item.lat !== null && item.lng !== null) {
    geoBits.push(`${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}`);
  }
  if (item.heading !== null) geoBits.push(`facing ${Math.round(item.heading)}°`);

  return (
    <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {insight && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              {SUBJECT_LABEL[insight.subjectType] ?? insight.subjectType}
            </span>
          )}
          {item.analysisStatus === "processing" && (
            <span className="text-xs text-emerald-600">Analyzing…</span>
          )}
          {item.analysisStatus === "pending" && (
            <span className="text-xs text-amber-600">Queued…</span>
          )}
          {item.analysisStatus === "failed" && (
            <span className="text-xs text-red-600">Analysis failed</span>
          )}
        </div>
        <button
          type="button"
          onClick={onReanalyze}
          disabled={busy}
          className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-medium text-stone-600 active:bg-stone-100 disabled:opacity-50"
        >
          {busy ? "Working…" : "Re-analyze"}
        </button>
      </div>

      {geoBits.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">📍 {geoBits.join(" · ")}</p>
      )}
      {item.placeLabel && (
        <p className="mt-0.5 text-xs text-stone-400">{item.placeLabel}</p>
      )}

      {insight ? (
        <>
          <p className="mt-2 text-stone-700">{insight.summary}</p>

          {insight.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {insight.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] text-stone-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {obs && (
            <dl className="mt-2 space-y-1 text-xs text-stone-600">
              <Field label="Health" value={obs.healthAssessment} />
              <Field label="Growth stage" value={obs.growthStage} />
              <Field label="Soil" value={obs.soilCondition} />
              <Field label="Pests / disease" value={obs.pestsOrDisease} />
              <Field label="Weeds" value={obs.weeds} />
              <Field label="Position notes" value={obs.gridNotes} />
            </dl>
          )}

          {obs && obs.recommendations.length > 0 && (
            <ListBlock label="Recommendations" items={obs.recommendations} />
          )}
          {obs && obs.concerns.length > 0 && (
            <ListBlock label="Watch for" items={obs.concerns} />
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-stone-400">
          No analysis yet. Add context below and analyze.
        </p>
      )}

      <div className="mt-3 border-t border-stone-200 pt-2">
        <label className="text-xs font-medium text-stone-500">
          Context for the AI
          {item.source === "upload" && " (uploaded photo — describe what & where)"}
        </label>
        <textarea
          value={contextDraft}
          onChange={(e) => onContextChange(e.target.value)}
          rows={2}
          placeholder="e.g. north bed, tomatoes showing leaf curl after the heat wave"
          className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm"
        />
        <button
          type="button"
          onClick={onSaveContext}
          disabled={busy}
          className="mt-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white active:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Working…" : "Save context & re-analyze"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-medium text-stone-500">{label}:</dt>
      <dd className="text-stone-600">{value}</dd>
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <ul className="mt-0.5 list-disc pl-4 text-xs text-stone-600">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
