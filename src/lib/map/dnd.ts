import type { Map as MaplibreMap } from "maplibre-gl";

// Single source of truth for the interactive location layer ids, shared by
// PlotMap (which defines the layers) and the drag layer (which hit-tests them).
export const LOCATION_LAYERS = {
  area: "loc-area-fill",
  line: "loc-line",
  point: "loc-point",
} as const;

export const INTERACTIVE_LAYER_IDS: string[] = [
  LOCATION_LAYERS.area,
  LOCATION_LAYERS.line,
  LOCATION_LAYERS.point,
];

export const VERTEX_LAYER = "edit-vertex";

export type DragKind = "planting" | "event" | "herd";

// An asset being dragged across the map onto a destination location.
export type DragAsset = {
  kind: DragKind;
  id: string;
  label: string;
  sublabel?: string;
  // Where it currently lives — used to reverse the move on Undo.
  fromLocationId: string | null;
};

// Records a just-applied move so it can be reversed by the Undo toast.
export type UndoableMove = {
  message: string;
  undo: () => Promise<void>;
};

// Find the location id under a screen point, hit-testing a small box around the
// finger so touches don't have to be pixel-perfect. `allowedTypes` restricts the
// drop to matching location types (e.g. ["paddock"] for a herd drag).
export function hitTestLocation(
  map: MaplibreMap,
  x: number,
  y: number,
  allowedTypes?: string[],
  pad = 10,
): string | null {
  const features = map.queryRenderedFeatures(
    [
      [x - pad, y - pad],
      [x + pad, y + pad],
    ],
    { layers: INTERACTIVE_LAYER_IDS },
  );
  const hit = features.find(
    (f) =>
      f.properties?.id &&
      (!allowedTypes ||
        allowedTypes.length === 0 ||
        allowedTypes.includes(String(f.properties.type))),
  );
  return hit ? String(hit.properties!.id) : null;
}

// Which location types a given drag kind may be dropped onto. Herds must land on
// a paddock; plantings/events can go on any location.
export function allowedDropTypes(kind: DragKind): string[] | undefined {
  return kind === "herd" ? ["paddock"] : undefined;
}
