"use client";

import { createContext, useContext } from "react";
import type { DragAsset } from "@/lib/map/dnd";
import type { LocationRecord, LocationType } from "@/lib/types";

export type PickOptions = {
  title: string;
  // Restrict tappable locations to these types (e.g. ["paddock"]). Empty = any.
  types?: LocationType[];
};

export type MapInteraction = {
  // Whether a tap-to-place pick is currently in progress (forms hide themselves).
  picking: boolean;
  // Enter tap-to-place mode; resolves with the chosen location id, or null if cancelled.
  requestPick: (opts: PickOptions) => Promise<string | null>;
  // Begin dragging an asset token. Call from a grip's onPointerDown.
  beginDrag: (asset: DragAsset, e: React.PointerEvent) => void;
  // Enter geometry-edit mode for a location (resize paddock / move pin).
  startEditGeometry: (location: LocationRecord) => void;
  // Enter draw-a-paddock mode.
  startDrawPaddock: () => void;
};

export const MapInteractionContext = createContext<MapInteraction | null>(null);

export function useMapInteraction(): MapInteraction {
  const ctx = useContext(MapInteractionContext);
  if (!ctx) {
    throw new Error("useMapInteraction must be used within MapInteractionContext");
  }
  return ctx;
}

// Safe variant for components that may render outside the provider during tests.
export function useMaybeMapInteraction(): MapInteraction | null {
  return useContext(MapInteractionContext);
}
