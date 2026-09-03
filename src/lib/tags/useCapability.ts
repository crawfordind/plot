"use client";

import { useSyncExternalStore } from "react";

// Browser capability probes that are safe to read during render.
//
// Both NFC and geolocation are decided by the device and never change while the
// page is open, so they are external, immutable state — exactly what
// useSyncExternalStore is for. Reading them this way (rather than probing in an
// effect and calling setState) keeps the server and first client render in
// agreement and avoids a cascading re-render on every mount.

// Nothing to subscribe to: the answer can't change mid-session.
const noopSubscribe = () => () => {};

// The server always assumes capable, so the markup it sends is the hopeful one;
// the first client render corrects it if the device says otherwise. Getting this
// backwards would flash "no NFC on this device" at every Android crew.
const serverSnapshot = () => true;

export function useNfcSupported(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof window !== "undefined" && "NDEFReader" in window,
    serverSnapshot,
  );
}

export function useGeolocationSupported(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== "undefined" && !!navigator.geolocation,
    serverSnapshot,
  );
}
