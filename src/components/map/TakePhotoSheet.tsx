"use client";

import { useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import PhotoInsightView from "@/components/locations/PhotoInsightView";
import { getCurrentFix, type CaptureFix } from "@/lib/capture/geo";
import {
  mergeCaptureGeo,
  prepareImageForUpload,
  type PreparedExif,
} from "@/lib/capture/prepareUpload";
import {
  formatDistance,
  orderLocationsByHierarchy,
  rankLocationsByDistance,
  type RankedLocation,
} from "@/lib/capture/nearest";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch, getErrorMessage } from "@/lib/client";
import type {
  AttachmentRecord,
  AttachmentSource,
  LocationRecord,
  PhotoInsightRecord,
} from "@/lib/types";

type TakePhotoSheetProps = {
  open: boolean;
  onClose: () => void;
  locations: LocationRecord[];
  selectedLocationId: string | null;
  mapCenter: [number, number] | null;
  onSaved: () => void;
};

type Phase = "pick" | "review" | "saving" | "result";

// Global "take a photo of the farm" capture. Records GPS + heading, suggests the
// nearest asset (you can change it), uploads, and runs the vision agronomist —
// showing the AI read inline so general photos still get sorted and understood.
export default function TakePhotoSheet({
  open,
  onClose,
  locations,
  selectedLocationId,
  mapCenter,
  onSaved,
}: TakePhotoSheetProps) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [preparedFile, setPreparedFile] = useState<File | null>(null);
  const [preparedExif, setPreparedExif] = useState<PreparedExif | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [source, setSource] = useState<AttachmentSource>("live_camera");
  const [fix, setFix] = useState<CaptureFix | null>(null);
  const [ranked, setRanked] = useState<RankedLocation[]>([]);
  const [chosenLocationId, setChosenLocationId] = useState<string>("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [insight, setInsight] = useState<PhotoInsightRecord | null>(null);
  const [analyzeFailed, setAnalyzeFailed] = useState<string | null>(null);
  const [resultGeo, setResultGeo] = useState<{
    lat: number | null;
    lng: number | null;
    heading: number | null;
  } | null>(null);

  const toast = useToast();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhase("pick");
    setPreparedFile(null);
    setPreparedExif(null);
    setPreparing(false);
    setPreviewUrl(null);
    setFix(null);
    setRanked([]);
    setChosenLocationId("");
    setNote("");
    setError(null);
    setSavedId(null);
    setInsight(null);
    setAnalyzeFailed(null);
    setResultGeo(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function onPicked(
    fileList: FileList | null,
    pickedSource: AttachmentSource,
  ) {
    const picked = fileList?.[0];
    if (!picked) return;
    setError(null);
    setSource(pickedSource);
    setPhase("review");
    setPreparing(true);

    // Prepare (resize + HEIC→JPEG) and get the location fix together. Preparing up
    // front means the preview and upload use the converted JPEG — so HEIC photos
    // preview correctly instead of showing a broken image.
    const [liveFix, prepared] = await Promise.all([
      getCurrentFix(),
      prepareImageForUpload(picked),
    ]);
    setFix(liveFix);
    setPreparedFile(prepared.file);
    setPreparedExif(prepared.exif);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(prepared.file));

    // Rank assets by the GPS fix, falling back to the current map centre.
    const origin: [number, number] | null =
      liveFix.lat !== null && liveFix.lng !== null
        ? [liveFix.lng, liveFix.lat]
        : mapCenter;
    const order = origin
      ? rankLocationsByDistance(locations, origin[0], origin[1])
      : locations.map((location) => ({ location, meters: null }));
    setRanked(order);

    // Pre-select: the asset already open, else the nearest.
    const preset =
      (selectedLocationId &&
        order.find((r) => r.location.id === selectedLocationId)?.location.id) ||
      order[0]?.location.id ||
      "";
    setChosenLocationId(preset);
    setPreparing(false);
  }

  async function analyze(id: string) {
    setAnalyzeFailed(null);
    try {
      const data = await apiFetch<{ insight: PhotoInsightRecord }>(
        `/api/attachments/${id}/analyze`,
        { method: "POST" },
      );
      setInsight(data.insight);
    } catch (err) {
      const message = getErrorMessage(err, "Analysis failed");
      setAnalyzeFailed(message);
      toast.error("Couldn't analyze photo", { description: message });
    }
  }

  async function save() {
    if (!preparedFile || !chosenLocationId) return;
    setPhase("saving");
    setError(null);
    try {
      // The file was already resized/converted at pick time.
      const geo = mergeCaptureGeo(fix, preparedExif, source !== "upload");
      setResultGeo({ lat: geo.lat, lng: geo.lng, heading: geo.heading });

      const form = new FormData();
      form.append("file", preparedFile);
      form.append("locationId", chosenLocationId);
      form.append("source", source);
      if (geo.lat !== null) form.append("lat", String(geo.lat));
      if (geo.lng !== null) form.append("lng", String(geo.lng));
      if (geo.accuracy !== null) form.append("gpsAccuracy", String(geo.accuracy));
      if (geo.heading !== null) form.append("heading", String(geo.heading));
      if (geo.capturedAt !== null) form.append("capturedAt", String(geo.capturedAt));
      if (note.trim()) form.append("userContext", note.trim());

      const { attachment } = await apiFetch<{ attachment: AttachmentRecord }>(
        "/api/attachments",
        { method: "POST", body: form },
      );
      setSavedId(attachment.id);
      setPhase("result");
      toast.success("Photo saved");
      onSaved();
      await analyze(attachment.id);
    } catch (err) {
      const message = getErrorMessage(err, "Upload failed");
      setError(message);
      toast.error("Couldn't save photo", { description: message });
      setPhase("review");
    }
  }

  const chosen = locations.find((l) => l.id === chosenLocationId) ?? null;
  // Display the asset list in farm-structure order (parent → child, siblings
  // grouped), while still showing each one's distance from the nearest ranking.
  const metersById = new Map(ranked.map((r) => [r.location.id, r.meters]));
  const ordered = orderLocationsByHierarchy(locations);

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="Farm photo"
      subtitle="Snap anything — we'll log where it was taken and read it with AI."
    >
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        className="hidden"
        onChange={(e) => onPicked(e.target.files, "live_camera")}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => onPicked(e.target.files, "upload")}
      />

      {phase === "pick" && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="touch-target rounded-xl bg-emerald-600 text-base font-semibold text-white active:bg-emerald-700"
          >
            📷 Take photo
          </button>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="touch-target rounded-xl border border-stone-200 text-base font-medium text-stone-700 active:bg-stone-50"
          >
            🖼 Choose from library
          </button>
          {locations.length === 0 && (
            <p className="mt-1 text-xs text-stone-400">
              Tip: add a farm or field first so photos can be filed to it.
            </p>
          )}
        </div>
      )}

      {(phase === "review" || phase === "saving") && (
        <div className="flex flex-col gap-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Selected"
              className="max-h-56 w-full rounded-xl object-cover"
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center rounded-xl bg-stone-100 text-sm text-stone-400">
              {preparing ? "Preparing photo…" : "No preview"}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-stone-500">
              File under which asset?
            </label>
            <select
              value={chosenLocationId}
              onChange={(e) => setChosenLocationId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white p-2 text-sm"
            >
              {ordered.length === 0 && <option value="">No assets yet</option>}
              {ordered.map(({ location, depth }) => {
                const meters = metersById.get(location.id) ?? null;
                const indent = "  ".repeat(depth);
                const branch = depth > 0 ? "└ " : "";
                const dist = meters !== null ? ` · ${formatDistance(meters)}` : "";
                return (
                  <option key={location.id} value={location.id}>
                    {`${indent}${branch}${location.name} (${location.type})${dist}`}
                  </option>
                );
              })}
            </select>
            <p className="mt-1 text-xs text-stone-400">
              {fix && fix.lat !== null
                ? "Nearest asset to your GPS is pre-selected — change it if needed."
                : "Location unavailable — pick the asset this belongs to."}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-500">
              Add context (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. washout along the north fence after last night's rain"
              className="mt-1 w-full rounded-lg border border-stone-200 p-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={phase === "saving"}
              className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50 disabled:opacity-50"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={save}
              disabled={
                phase === "saving" ||
                preparing ||
                !preparedFile ||
                !chosenLocationId
              }
              className="touch-target flex-[2] rounded-xl bg-emerald-600 text-sm font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
            >
              {phase === "saving"
                ? "Saving…"
                : preparing
                  ? "Preparing…"
                  : "Save & analyze"}
            </button>
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="flex flex-col gap-3">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Saved"
              className="max-h-48 w-full rounded-xl object-cover"
            />
          )}
          {chosen && (
            <p className="text-xs text-stone-500">
              Filed under <span className="font-medium text-stone-700">{chosen.name}</span>{" "}
              ({chosen.type})
            </p>
          )}

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <PhotoInsightView
              insight={insight}
              status={insight ? "done" : analyzeFailed ? "failed" : "processing"}
              analyzing={!insight && !analyzeFailed}
              error={analyzeFailed}
              geo={
                resultGeo ? { ...resultGeo, placeLabel: null } : undefined
              }
              onRetry={savedId ? () => analyze(savedId) : undefined}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50"
            >
              Take another
            </button>
            <button
              type="button"
              onClick={close}
              className="touch-target flex-1 rounded-xl bg-stone-800 text-sm font-semibold text-white active:bg-stone-900"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
