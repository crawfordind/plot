"use client";

import { useEffect, useRef, useState } from "react";
import TagScanView from "@/components/tags/TagScanView";
import UnknownTagView from "@/components/tags/UnknownTagView";
import VisitSheet from "@/components/tags/VisitSheet";
import Icon from "@/components/ui/Icon";
import { useToast } from "@/components/ui/toast/ToastProvider";
import type { EventRecord, NearbyCandidate, TagResolution } from "@/lib/types";

// The scan landing shown inside the app, as a full-screen sheet over the map.
// Same two views as the /t/[code] page — a tap should land somewhere identical
// whether the phone was already in Plot or opened the URL cold.

// Mounted per scan (the parent keys it on the code), so each tap starts from a
// clean slate instead of briefly showing the previous tube's record.
type TagScanSheetProps = {
  tagCode: string;
  crewName: string | null;
  farmName: string | null;
  position: { lat: number; lng: number } | null;
  onClose: () => void;
  onShowOnMap: (locationId: string) => void;
  onVisitLogged: () => void;
  onClaimNew?: () => void;
};

export default function TagScanSheet({
  tagCode,
  crewName,
  farmName,
  position,
  onClose,
  onShowOnMap,
  onVisitLogged,
  onClaimNew,
}: TagScanSheetProps) {
  const toast = useToast();
  const [resolution, setResolution] = useState<TagResolution | null>(null);
  const [nearby, setNearby] = useState<NearbyCandidate[]>([]);
  // Starts true because the component only ever mounts to load one tag.
  const [loading, setLoading] = useState(true);
  const [visitOpen, setVisitOpen] = useState(false);

  // The fix is read once at mount rather than tracked: a scan happens where the
  // crew is standing, and a later drift shouldn't re-rank the nearby list under
  // them mid-decision.
  const fixRef = useRef(position);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const fix = fixRef.current;
        const query = fix ? `?lat=${fix.lat}&lng=${fix.lng}` : "";
        // Plain fetch: on an unknown tag the 404 body carries the nearby
        // candidates, which is the whole recovery path — not an error to throw
        // away, which is what apiFetch would do with it.
        const res = await fetch(`/api/tags/${tagCode}${query}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setResolution(data as TagResolution);
        else setNearby(Array.isArray(data?.nearby) ? data.nearby : []);
      } catch {
        if (cancelled) return;
        toast.error("Couldn't read that tag", {
          description: "Check your connection and hold the phone to it again.",
        });
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tagCode, toast, onClose]);

  function handleSaved(event: EventRecord, scanNext: boolean) {
    setVisitOpen(false);
    toast.success("Visit saved");
    onVisitLogged();
    // "Save & scan next" leaves the reader armed and steps out of the way, so a
    // crew walks the row without touching the screen between tubes.
    if (scanNext) {
      onClose();
      return;
    }
    setResolution((current) =>
      current
        ? {
            ...current,
            recentVisits: [event, ...current.recentVisits].slice(0, 3),
            growth:
              event.heightCm != null
                ? [
                    ...current.growth,
                    { occurredAt: event.occurredAt, heightCm: event.heightCm },
                  ]
                : current.growth,
          }
        : current,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close tag"
        className="focus-ring absolute right-3 top-[calc(var(--safe-top)+0.75rem)] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur"
      >
        <Icon name="x" size={20} />
      </button>

      {loading ? (
        <div className="flex h-full items-center justify-center text-sm text-stone-500">
          Reading tag…
        </div>
      ) : resolution ? (
        <>
          <TagScanView
            resolution={resolution}
            onLogVisit={() => setVisitOpen(true)}
            onShowOnMap={() => {
              onShowOnMap(resolution.location.id);
              onClose();
            }}
            onOpenRecord={() => {
              onShowOnMap(resolution.location.id);
              onClose();
            }}
          />
          <VisitSheet
            open={visitOpen}
            onClose={() => setVisitOpen(false)}
            tagCode={tagCode}
            locationName={resolution.location.name}
            crewName={crewName}
            heightUnit={resolution.heightUnit}
            lastVisit={resolution.recentVisits[0] ?? null}
            position={position}
            onSaved={handleSaved}
          />
        </>
      ) : (
        <UnknownTagView
          tagCode={tagCode}
          nearby={nearby}
          farmName={farmName}
          hasFix={position !== null}
          onIgnore={onClose}
          onClaimNew={onClaimNew}
          onMatch={(locationId) => {
            onShowOnMap(locationId);
            onClose();
          }}
        />
      )}
    </div>
  );
}
