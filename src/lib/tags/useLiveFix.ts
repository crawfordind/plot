"use client";

import { useEffect, useRef, useState } from "react";
import { useGeolocationSupported } from "@/lib/tags/useCapability";

export type LiveFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

// A GPS fix kept warm for as long as tag mode is armed.
//
// Field-encode makes a tag's identity and its position the same event, so the
// fix has to be ready the instant a chip answers — asking for one only then puts
// an 8-second cold start between the crew and every tube. watchPosition keeps it
// fresh across a whole run for the cost of one permission prompt.
export function useLiveFix(active: boolean): {
  fix: LiveFix | null;
  error: string | null;
} {
  const supported = useGeolocationSupported();
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !supported) return;

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setWatchError(null);
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
      },
      (err) => {
        // A denied or unavailable fix is not fatal: the tag still writes, it
        // just lands without a pin, and the crew can place it later.
        setWatchError(
          err.code === err.PERMISSION_DENIED
            ? "Location is off — tags will be written without a pin."
            : "Waiting for a GPS fix…",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [active, supported]);

  return {
    fix,
    error: supported ? watchError : "This device can't report its location.",
  };
}
