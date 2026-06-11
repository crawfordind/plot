"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { allowedDropTypes, hitTestLocation, type DragAsset } from "@/lib/map/dnd";

export type AssetDragHandle = {
  // Called from a grip's onPointerDown to start a drag. Captures the pointer on a
  // stable element so the gesture survives the originating sheet collapsing and
  // the map never pans mid-drag.
  begin: (asset: DragAsset, pointerId: number, x: number, y: number) => void;
};

type AssetDragLayerProps = {
  getMap: () => MaplibreMap | null;
  onHoverTarget: (id: string | null) => void;
  onDrop: (asset: DragAsset, targetLocationId: string) => void;
  onCancel: () => void;
};

const AssetDragLayer = forwardRef<AssetDragHandle, AssetDragLayerProps>(
  function AssetDragLayer({ getMap, onHoverTarget, onDrop, onCancel }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const assetRef = useRef<DragAsset | null>(null);
    const targetRef = useRef<string | null>(null);
    const [drag, setDrag] = useState<{ asset: DragAsset; x: number; y: number } | null>(
      null,
    );

    useImperativeHandle(
      ref,
      () => ({
        begin(asset, pointerId, x, y) {
          assetRef.current = asset;
          targetRef.current = null;
          setDrag({ asset, x, y });
          const el = rootRef.current;
          if (el) {
            try {
              el.setPointerCapture(pointerId);
            } catch {
              // capture is best-effort; window-level events still arrive
            }
          }
        },
      }),
      [],
    );

    const hitTest = useCallback(
      (x: number, y: number): string | null => {
        const map = getMap();
        if (!map) return null;
        const rect = map.getCanvas().getBoundingClientRect();
        const types = assetRef.current
          ? allowedDropTypes(assetRef.current.kind)
          : undefined;
        return hitTestLocation(map, x - rect.left, y - rect.top, types);
      },
      [getMap],
    );

    const handleMove = useCallback(
      (e: React.PointerEvent) => {
        if (!assetRef.current) return;
        e.preventDefault();
        const target = hitTest(e.clientX, e.clientY);
        if (target !== targetRef.current) {
          targetRef.current = target;
          onHoverTarget(target);
        }
        setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      },
      [hitTest, onHoverTarget],
    );

    const end = useCallback(() => {
      const asset = assetRef.current;
      if (!asset) return;
      const target = targetRef.current;
      assetRef.current = null;
      targetRef.current = null;
      onHoverTarget(null);
      setDrag(null);
      if (target && target !== asset.fromLocationId) onDrop(asset, target);
      else onCancel();
    }, [onDrop, onCancel, onHoverTarget]);

    return (
      <>
        {/* Tiny always-mounted capture target. Captured pointer events route here
            regardless of its size/position, so it never blocks the map when idle. */}
        <div
          ref={rootRef}
          onPointerMove={handleMove}
          onPointerUp={end}
          onPointerCancel={end}
          className="fixed left-0 top-0 z-[60]"
          style={{ width: 1, height: 1, touchAction: "none" }}
        />
        {drag && (
          <div
            className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-1/2 select-none rounded-full bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-xl ring-2 ring-white"
            style={{ left: drag.x, top: drag.y }}
          >
            {drag.asset.label}
          </div>
        )}
      </>
    );
  },
);

export default AssetDragLayer;
