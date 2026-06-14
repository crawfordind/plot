"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentFix } from "@/lib/capture/geo";
import {
  MAX_DIRECT_UPLOAD_BYTES,
  isImageLike,
  mergeCaptureGeo,
  prepareImageForUpload,
} from "@/lib/capture/prepareUpload";
import PhotoInsightView, {
  SUBJECT_LABEL,
} from "@/components/locations/PhotoInsightView";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import type { AttachmentRecord, AttachmentSource } from "@/lib/types";

type AttachmentsSectionProps = {
  locationId: string;
};

// .heic/.heif are listed explicitly — some pickers don't match them via image/*.
const FILE_ACCEPT =
  "image/*,.heic,.heif,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

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

// Photos, media and documents attached to a location, each run through the vision
// agronomist model. Camera capture records GPS + heading; the newest photo's AI
// read surfaces automatically, and analysis state is always visible (never silent).
export default function AttachmentsSection({
  locationId,
}: AttachmentsSectionProps) {
  const toast = useToast();
  const [items, setItems] = useState<AttachmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  // Ids currently being analyzed, and the last analyze error per id.
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [analyzeErrors, setAnalyzeErrors] = useState<Record<string, string>>({});
  const [savingContext, setSavingContext] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ attachments: AttachmentRecord[] }>(
        `/api/attachments?locationId=${locationId}`,
      );
      setItems(data.attachments);
    } catch {
      // Non-fatal background refresh — leave the stale list visible.
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    // Data-sync effect: load() flips a loading flag then resolves via fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const setPendingFor = useCallback((id: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Kick off (or retry) analysis for one image — never silent: failures are
  // captured and shown with a Retry affordance.
  const analyze = useCallback(
    async (id: string) => {
      setPendingFor(id, true);
      setAnalyzeErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        await apiFetch(`/api/attachments/${id}/analyze`, { method: "POST" });
      } catch (err) {
        const message = getErrorMessage(err, "Analysis failed");
        setAnalyzeErrors((prev) => ({ ...prev, [id]: message }));
        toast.error("Couldn't analyze photo", { description: message });
      } finally {
        setPendingFor(id, false);
        await load();
      }
    },
    [load, setPendingFor, toast],
  );

  async function handleFiles(
    fileList: FileList | null,
    source: AttachmentSource,
  ) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);

    const fix = source === "asset_camera" ? await getCurrentFix() : null;
    const live = source !== "upload";

    const newImageIds: string[] = [];
    try {
      for (const original of Array.from(fileList)) {
        // Non-image files can't be shrunk client-side — fail fast with a clear
        // message rather than letting the platform reject the oversized body.
        if (!isImageLike(original) && original.size > MAX_DIRECT_UPLOAD_BYTES) {
          throw new Error(
            `"${original.name}" is too large to upload (over ~4 MB). Large videos/PDFs aren't supported yet.`,
          );
        }
        // Downscale + re-encode images client-side (and recover EXIF geo) so big
        // phone photos stay under the platform's upload size limit.
        const prepared = await prepareImageForUpload(original);
        const geo = mergeCaptureGeo(fix, prepared.exif, live);
        const form = new FormData();
        form.append("file", prepared.file);
        form.append("locationId", locationId);
        form.append("source", source);
        if (geo.lat !== null) form.append("lat", String(geo.lat));
        if (geo.lng !== null) form.append("lng", String(geo.lng));
        if (geo.accuracy !== null)
          form.append("gpsAccuracy", String(geo.accuracy));
        if (geo.heading !== null) form.append("heading", String(geo.heading));
        if (geo.capturedAt !== null)
          form.append("capturedAt", String(geo.capturedAt));
        const { attachment } = await apiFetch<{ attachment: AttachmentRecord }>(
          "/api/attachments",
          { method: "POST", body: form },
        );
        if (attachment.kind === "image") newImageIds.push(attachment.id);
      }
      await load();
      // Surface the freshest photo's read immediately, then analyze automatically.
      if (newImageIds.length > 0) {
        setSelectedId(newImageIds[newImageIds.length - 1]);
        setContextDraft("");
        toast.success(
          newImageIds.length === 1 ? "Photo saved" : `${newImageIds.length} photos saved`,
        );
      } else {
        toast.success("File uploaded");
      }
      await Promise.all(newImageIds.map((id) => analyze(id)));
    } catch (err) {
      const message = getErrorMessage(err, "Upload failed");
      setError(message);
      toast.error("Couldn't upload file", { description: message });
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function saveContextAndAnalyze(id: string) {
    setSavingContext(true);
    try {
      await apiFetch(`/api/attachments/${id}`, {
        method: "PATCH",
        body: { userContext: contextDraft },
      });
    } finally {
      setSavingContext(false);
    }
    await analyze(id);
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
    try {
      await apiFetch(`/api/attachments/${id}`, { method: "DELETE" });
      toast.success("Attachment deleted");
    } catch (err) {
      const message = getErrorMessage(err, "Couldn't delete attachment");
      toast.error("Couldn't delete attachment", { description: message });
      // Reload to restore the item in the list since the delete failed.
      await load();
    }
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
  const analyzingCount = items.filter(
    (i) => pending.has(i.id) || i.analysisStatus === "processing",
  ).length;

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
        accept="image/*,.heic,.heif"
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

      {analyzingCount > 0 && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          AI agronomist is reading {analyzingCount} photo
          {analyzingCount > 1 ? "s" : ""}…
        </p>
      )}

      {loading ? (
        <p className="mt-3 py-2 text-sm text-stone-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 py-2 text-sm text-stone-400">
          No photos or files yet — take a field photo and the AI agronomist will read it.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {items.map((item) => {
            const itemAnalyzing =
              pending.has(item.id) || item.analysisStatus === "processing";
            return (
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
                    <span className="relative block h-full w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt={item.caption ?? item.fileName}
                        className="h-full w-full object-cover"
                      />
                      {item.insight && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] font-medium text-white">
                          {SUBJECT_LABEL[item.insight.subjectType] ??
                            item.insight.subjectType}
                        </span>
                      )}
                      {itemAnalyzing && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <span className="h-4 w-4 animate-pulse rounded-full bg-emerald-400" />
                        </span>
                      )}
                      {!itemAnalyzing && item.analysisStatus === "failed" && (
                        <span className="absolute right-1 bottom-1 rounded bg-red-500 px-1 text-[9px] font-bold text-white">
                          !
                        </span>
                      )}
                    </span>
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
                <button
                  type="button"
                  aria-label={`Delete ${item.fileName}`}
                  onClick={() => remove(item.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-xs text-white active:bg-black/75"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && selected.kind === "image" && (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <PhotoInsightView
            insight={selected.insight}
            status={selected.analysisStatus}
            analyzing={pending.has(selected.id)}
            error={analyzeErrors[selected.id] ?? null}
            geo={{
              lat: selected.lat,
              lng: selected.lng,
              heading: selected.heading,
              placeLabel: selected.placeLabel,
            }}
            onRetry={() => analyze(selected.id)}
          />

          <div className="mt-3 border-t border-stone-200 pt-2">
            <label className="text-xs font-medium text-stone-500">
              Context for the AI
              {selected.source === "upload" &&
                " (uploaded photo — describe what & where)"}
            </label>
            <textarea
              value={contextDraft}
              onChange={(e) => setContextDraft(e.target.value)}
              rows={2}
              placeholder="e.g. north bed, tomatoes showing leaf curl after the heat wave"
              className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm"
            />
            <button
              type="button"
              onClick={() => saveContextAndAnalyze(selected.id)}
              disabled={savingContext || pending.has(selected.id)}
              className="mt-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white active:bg-emerald-700 disabled:opacity-50"
            >
              {savingContext || pending.has(selected.id)
                ? "Working…"
                : "Save context & re-analyze"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
