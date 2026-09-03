"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TagScanView from "@/components/tags/TagScanView";
import UnknownTagView from "@/components/tags/UnknownTagView";
import VisitSheet from "@/components/tags/VisitSheet";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { apiFetch } from "@/lib/client";
import { getCurrentFix } from "@/lib/capture/geo";
import type { EventRecord, NearbyCandidate, TagResolution } from "@/lib/types";

// Client half of /t/[code]. The server already resolved the tag, so the screen
// paints immediately; this layer only handles what needs the device — recording
// the read, and the GPS fix that turns an unknown tag into a recoverable one.

type TagLandingProps = {
  tagCode: string;
  initialResolution: TagResolution | null;
  crewName: string | null;
};

export default function TagLanding({
  tagCode,
  initialResolution,
  crewName,
}: TagLandingProps) {
  const router = useRouter();
  const toast = useToast();
  const [resolution, setResolution] = useState(initialResolution);
  const [nearby, setNearby] = useState<NearbyCandidate[]>([]);
  const [hasFix, setHasFix] = useState(false);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [visitOpen, setVisitOpen] = useState(false);

  // Record the scan itself. Best-effort and deliberately silent: the read is
  // what feeds the silent-tag report, but failing to log it must never stand
  // between a crew and the tube in front of them.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fix = await getCurrentFix();
      if (cancelled) return;

      const coords =
        fix.lat != null && fix.lng != null ? { lat: fix.lat, lng: fix.lng } : null;
      setPosition(coords);
      setHasFix(coords !== null);

      if (resolution) {
        try {
          await apiFetch(`/api/tags/${tagCode}/reads`, {
            method: "POST",
            body: { readVia: "nfc", ...(coords ?? {}) },
          });
        } catch {
          // Silent by design — see above.
        }
        return;
      }

      // Unknown tag: re-ask the server now that we have a fix, so it can offer
      // the records close enough to be what the crew is actually looking at.
      // Plain fetch rather than apiFetch, because here the 404 IS the payload —
      // the candidate list rides on its body and apiFetch turns it into a throw.
      if (!coords) return;
      try {
        const res = await fetch(
          `/api/tags/${tagCode}?lat=${coords.lat}&lng=${coords.lng}`,
        );
        const data = (await res.json()) as { nearby?: NearbyCandidate[] };
        if (!cancelled && Array.isArray(data.nearby)) setNearby(data.nearby);
      } catch {
        // Nothing more to offer; the screen still shows "claim as new".
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tagCode, resolution]);

  function handleSaved(event: EventRecord) {
    setVisitOpen(false);
    toast.success("Visit saved");
    // Fold the new visit into the screen so the history and growth curve are
    // right without a round trip.
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

  if (!resolution) {
    return (
      <UnknownTagView
        tagCode={tagCode}
        nearby={nearby}
        hasFix={hasFix}
        onIgnore={() => router.push("/")}
        // Claiming and matching both mean writing a tag, which needs the map's
        // farm context — so both routes hand off to the app rather than trying
        // to reproduce that context on a cold landing page.
        onClaimNew={() => router.push("/?tagMode=1")}
        onMatch={(locationId) => router.push(`/?location=${locationId}&tagMode=1`)}
      />
    );
  }

  return (
    <>
      <TagScanView
        resolution={resolution}
        onLogVisit={() => setVisitOpen(true)}
        onShowOnMap={() => router.push(`/?location=${resolution.location.id}`)}
        onOpenRecord={() => router.push(`/?location=${resolution.location.id}`)}
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
        onDictate={() => {
          const name = resolution.location.name;
          router.push(`/?log=${encodeURIComponent(`Visit ${name}: `)}`);
        }}
      />
    </>
  );
}

export type { TagLandingProps };
