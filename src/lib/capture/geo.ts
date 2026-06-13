"use client";

// Client-side capture of where the user is and which way they're facing when they
// take a photo in-app. Everything is best-effort: denied permission, no sensor, or
// an insecure context yields nulls rather than an error, so capture never blocks.

export type CaptureFix = {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  heading: number | null;
};

function getPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  });
}

type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

// Listen briefly for a compass reading. iOS exposes webkitCompassHeading directly;
// elsewhere we derive it from `alpha` on absolute orientation events.
function getHeading(): Promise<number | null> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("deviceorientationabsolute", handler);
      window.removeEventListener("deviceorientation", handler);
      clearTimeout(timer);
      resolve(value);
    };

    const handler = (event: Event) => {
      const e = event as CompassEvent;
      if (typeof e.webkitCompassHeading === "number") {
        finish(((e.webkitCompassHeading % 360) + 360) % 360);
        return;
      }
      if (typeof e.alpha === "number") {
        // alpha is counter-clockwise from east-ish; convert to a clockwise compass.
        finish(((360 - e.alpha) % 360 + 360) % 360);
      }
    };

    window.addEventListener("deviceorientationabsolute", handler, { once: false });
    window.addEventListener("deviceorientation", handler, { once: false });
    const timer = setTimeout(() => finish(null), 1200);
  });
}

export async function getCurrentFix(): Promise<CaptureFix> {
  const [pos, heading] = await Promise.all([getPosition(), getHeading()]);
  return {
    lat: pos ? pos.coords.latitude : null,
    lng: pos ? pos.coords.longitude : null,
    accuracy: pos ? pos.coords.accuracy : null,
    heading,
  };
}
