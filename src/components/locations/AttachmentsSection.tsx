"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AttachmentRecord } from "@/lib/types";

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

// Photos, media and documents attached to a location. Fetches its own list so it
// only loads when an asset is open. Camera capture on phones + a general file
// picker, a thumbnail grid, and per-item delete.
export default function AttachmentsSection({
  locationId,
}: AttachmentsSectionProps) {
  const [items, setItems] = useState<AttachmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    // Fetch this location's attachments when the open asset changes. load() sets
    // a loading flag then resolves via fetch — a legitimate data-sync effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const form = new FormData();
        form.append("file", file);
        form.append("locationId", locationId);
        const res = await fetch("/api/attachments", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Upload failed");
        }
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/attachments/${id}`, { method: "DELETE" }).catch(() => {});
  }

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
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        accept={FILE_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
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
          No photos or files yet — add field photos, soil tests, permits…
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {items.map((item) => (
            <li key={item.id} className="group relative">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-xl border border-stone-200 bg-stone-50"
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
              </a>
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
    </section>
  );
}
