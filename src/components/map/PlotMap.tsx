"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import type {
  Map as MaplibreMap,
  MapMouseEvent,
  MapTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MapFabCluster from "@/components/map/MapFabCluster";
import { LOCATION_LAYERS, VERTEX_LAYER } from "@/lib/map/dnd";
import {
  geometryBounds,
  geometryCenter,
  geometryVertices,
  pointsToGeometry,
  rotateGeometry,
  scaleGeometry,
  translateGeometry,
} from "@/lib/map/geometry";
import { locationTypeEmoji } from "@/lib/locations/catalog";
import type { GeoJSONGeometry, LocationRecord, PaddockStatus } from "@/lib/types";

export type EditGeometry = { id: string; geometry: GeoJSONGeometry };
export type ChildGeometry = { id: string; geometry: GeoJSONGeometry };

// Layer ids for the transform gizmo (resize corners + rotate knob).
const SCALE_LAYER = "edit-scale";
const ROTATE_LAYER = "edit-rotate";
const POINT_MOVE_LAYER = "edit-point";

// Satellite basemap: Esri World Imagery raster tiles + a glyph endpoint so the
// location labels (symbol layers) still render over the imagery.
const SATELLITE_STYLE = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

type PlotMapProps = {
  locations: LocationRecord[];
  // The primary subject (drives recenter/flyTo).
  selectedLocationId: string | null;
  // Every id to render highlighted (a whole group, a drilled child, or several
  // multi-selected parts). Defaults to just selectedLocationId when omitted.
  selectedIds?: string[];
  onSelectLocation: (id: string | null) => void;
  onAddPin: (lng: number, lat: number) => void;
  onCenterChange?: (lng: number, lat: number) => void;
  dropMode: boolean;
  grazingStatus?: Record<string, PaddockStatus>;
  // Imperative handle so overlays can hit-test / unproject.
  onMapReady?: (map: MaplibreMap) => void;
  // Tap-to-place: highlight locations and route taps to onLocationPick.
  pickMode?: boolean;
  onLocationPick?: (id: string) => void;
  // Location currently under a dragged asset token.
  dropTargetId?: string | null;
  // Draw a new polygon by tapping vertices (parent holds the points).
  drawPoints?: [number, number][] | null;
  onDrawPoint?: (lng: number, lat: number) => void;
  // Edit an existing geometry by move/rotate/resize; emits the live drafts.
  editGeometry?: EditGeometry | null;
  // Descendant locations that move in relation to the edited parent.
  editChildren?: ChildGeometry[];
  onGeometryChange?: (geometry: GeoJSONGeometry, children: ChildGeometry[]) => void;
  // Primary map actions, owned by MapShell (they open overlays). Rendered inside
  // the shared FAB cluster so nothing overlaps.
  onCapturePhoto?: () => void;
  onAskExpert?: () => void;
  fabActionsHidden?: boolean;
};

const { area: AREA_LAYER, line: LINE_LAYER, point: POINT_LAYER } = LOCATION_LAYERS;
const INTERACTIVE = [AREA_LAYER, LINE_LAYER, POINT_LAYER];

type Feature = {
  type: "Feature";
  id?: string;
  properties: {
    id: string;
    name: string;
    type: string;
    emoji: string;
    depth: number;
    selected: boolean;
    grazeStatus: string;
    isDrop: boolean;
  };
  geometry: GeoJSONGeometry;
};

function kindOf(geometry: GeoJSONGeometry): "area" | "line" | "point" {
  if (geometry.type === "Polygon") return "area";
  if (geometry.type === "LineString") return "line";
  return "point";
}

function eachCoord(g: GeoJSONGeometry, fn: (lng: number, lat: number) => void) {
  if (g.type === "Point") fn(g.coordinates[0], g.coordinates[1]);
  else if (g.type === "LineString") g.coordinates.forEach((c) => fn(c[0], c[1]));
  else g.coordinates.forEach((ring) => ring.forEach((c) => fn(c[0], c[1])));
}

// Bounding box of all location geometries: [[minLng,minLat],[maxLng,maxLat]].
function boundsOf(
  locations: LocationRecord[],
): [[number, number], [number, number]] | null {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const l of locations) {
    eachCoord(l.geometry, (lng, lat) => {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    });
  }
  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function centroidOf(g: GeoJSONGeometry): [number, number] | null {
  let sx = 0,
    sy = 0,
    n = 0;
  eachCoord(g, (lng, lat) => {
    sx += lng;
    sy += lat;
    n++;
  });
  return n ? [sx / n, sy / n] : null;
}

function pointFeatures(
  coords: { coord: [number, number]; props?: Record<string, unknown> }[],
) {
  return {
    type: "FeatureCollection" as const,
    features: coords.map(({ coord, props }) => ({
      type: "Feature" as const,
      properties: props ?? {},
      geometry: { type: "Point" as const, coordinates: coord },
    })),
  };
}

function vertexCollection(geometry: GeoJSONGeometry | null) {
  const verts = geometry ? geometryVertices(geometry) : [];
  return pointFeatures(verts.map((c, idx) => ({ coord: c, props: { idx } })));
}

// A single GeoJSON Feature wrapping a geometry (for the edited parent draft).
function parentFeatureData(g: GeoJSONGeometry) {
  return { type: "Feature" as const, properties: {}, geometry: g };
}

// A FeatureCollection of the children that move along with the parent.
function childCollectionData(children: ChildGeometry[]) {
  return {
    type: "FeatureCollection" as const,
    features: children.map((c) => ({
      type: "Feature" as const,
      properties: {},
      geometry: c.geometry,
    })),
  };
}

// Bounding box + resize/rotate handle geometries derived from a draft geometry.
// Returns null for points (which only support move).
function gizmoData(g: GeoJSONGeometry | null) {
  if (!g || g.type === "Point") return null;
  const b = geometryBounds([g]);
  if (!b) return null;
  const [[minLng, minLat], [maxLng, maxLat]] = b;
  const h = maxLat - minLat;
  const offset = Math.max(h * 0.3, 0.0002);
  const topMid: [number, number] = [(minLng + maxLng) / 2, maxLat];
  const rotKnob: [number, number] = [topMid[0], maxLat + offset];
  const corners: [number, number][] = [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
  ];
  const bboxRing: [number, number][] = [...corners, corners[0]];
  return {
    bbox: parentFeatureData({ type: "Polygon", coordinates: [bboxRing] }),
    rotLine: parentFeatureData({ type: "LineString", coordinates: [topMid, rotKnob] }),
    corners: pointFeatures(corners.map((coord) => ({ coord }))),
    rotKnob: pointFeatures([{ coord: rotKnob }]),
  };
}

export default function PlotMap({
  locations,
  selectedLocationId,
  selectedIds,
  onSelectLocation,
  onAddPin,
  onCenterChange,
  dropMode,
  grazingStatus,
  onMapReady,
  pickMode = false,
  onLocationPick,
  dropTargetId,
  drawPoints,
  onDrawPoint,
  editGeometry,
  editChildren,
  onGeometryChange,
  onCapturePhoto,
  onAskExpert,
  fabActionsHidden,
}: PlotMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [locating, setLocating] = useState(false);
  const [viewState, setViewState] = useState({
    longitude: -70.9,
    latitude: 43.2,
    zoom: 12,
  });

  // Live draft geometry while editing. Re-seeded when the edited feature changes
  // using the "adjust state during render" pattern (no effect needed).
  const [draft, setDraft] = useState<GeoJSONGeometry | null>(null);
  const draftRef = useRef<GeoJSONGeometry | null>(null);
  const [childDrafts, setChildDrafts] = useState<ChildGeometry[]>([]);
  const childDraftsRef = useRef<ChildGeometry[]>([]);
  const [seedId, setSeedId] = useState<string | null>(null);
  const editing = !!editGeometry;

  // The set of ids rendered highlighted. Falls back to the single subject.
  const selectedIdSet = useMemo(
    () => new Set(selectedIds ?? (selectedLocationId ? [selectedLocationId] : [])),
    [selectedIds, selectedLocationId],
  );

  const currentEditId = editGeometry?.id ?? null;
  if (currentEditId !== seedId) {
    setSeedId(currentEditId);
    setDraft(editGeometry?.geometry ?? null);
    setChildDrafts(editChildren ?? []);
  }

  // Keep ref copies so the imperative drag handlers read the latest drafts.
  // (Refs are synced in effects, never during render.)
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    childDraftsRef.current = childDrafts;
  }, [childDrafts]);

  // Latest drafts produced during a drag (committed to React state on pointer-up).
  const latestRef = useRef<{ parent: GeoJSONGeometry; children: ChildGeometry[] } | null>(
    null,
  );
  // Keep the change callback in a ref so the gizmo effect doesn't re-bind handlers
  // on every parent render (which would make dragging janky).
  const onGeometryChangeRef = useRef(onGeometryChange);
  useEffect(() => {
    onGeometryChangeRef.current = onGeometryChange;
  }, [onGeometryChange]);

  const centeredRef = useRef(false);
  const mapReadyRef = useRef(false);

  const centerOnGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setViewState({
          longitude: position.coords.longitude,
          latitude: position.coords.latitude,
          zoom: 18,
        });
        onCenterChange?.(position.coords.longitude, position.coords.latitude);
        centeredRef.current = true;
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [onCenterChange]);

  // Frame all of the user's plots. The primary way a returning/off-site user
  // (no GPS) reaches their data instead of being stranded on a default view.
  const fitToData = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = boundsOf(locations);
    if (!b) return;
    map.fitBounds(b, { padding: 60, maxZoom: 18, duration: 600 });
    centeredRef.current = true;
  }, [locations]);

  // On first data load, frame the plots (preferred); only fall back to GPS when
  // there's nothing mapped yet (a brand-new user wants their current location).
  useEffect(() => {
    if (!mapReadyRef.current || centeredRef.current) return;
    if (locations.length > 0) fitToData();
  }, [locations, fitToData]);

  // Recenter when the selected subject *changes* (e.g. tapped in Records). Keyed
  // off a ref of the last-flown id so a background data refresh (new `locations`
  // identity) doesn't yank the camera back while the user is panning around.
  const lastFlownRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !selectedLocationId) {
      lastFlownRef.current = selectedLocationId ?? null;
      return;
    }
    if (lastFlownRef.current === selectedLocationId) return;
    lastFlownRef.current = selectedLocationId;
    const loc = locations.find((l) => l.id === selectedLocationId);
    if (!loc) return;
    const c = centroidOf(loc.geometry);
    if (c) {
      map.flyTo({ center: c, zoom: Math.max(map.getZoom(), 16), duration: 500 });
    }
  }, [selectedLocationId, locations]);

  // Transform gizmo: move (drag body), resize (drag a corner), rotate (drag the
  // knob). All three move the whole object — and any child locations — together.
  // The drag updates the map sources IMPERATIVELY (no React re-render per frame),
  // committing to state only on pointer-up, so dragging stays smooth. A single
  // mousedown hit-test picks the mode deterministically (rotate > resize > move).
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !editing) return;

    type Gesture = {
      mode: "move" | "scale" | "rotate";
      center: [number, number];
      cosLat: number;
      startParent: GeoJSONGeometry;
      startChildren: ChildGeometry[];
      startLng: number;
      startLat: number;
      startAngle: number;
      startDist: number;
    };
    let gesture: Gesture | null = null;

    const setCursor = (c: string) => {
      map.getCanvas().style.cursor = c;
    };

    const getGeo = (id: string) =>
      map.getLayer(id) || map.getSource(id)
        ? (map.getSource(id) as unknown as { setData: (d: unknown) => void } | undefined)
        : undefined;

    // Push the live drafts straight to the map sources (the smooth path).
    const paint = (parent: GeoJSONGeometry, children: ChildGeometry[]) => {
      getGeo("edit-src")?.setData(parentFeatureData(parent));
      getGeo("edit-children")?.setData(childCollectionData(children));
      const gz = gizmoData(parent);
      if (gz) {
        getGeo("edit-bbox")?.setData(gz.bbox);
        getGeo("edit-rotate-line")?.setData(gz.rotLine);
        getGeo("edit-scale-src")?.setData(gz.corners);
        getGeo("edit-rotate-src")?.setData(gz.rotKnob);
      }
      latestRef.current = { parent, children };
    };

    const onDown = (e: MapMouseEvent | MapTouchEvent) => {
      if (gesture) return;
      const present = (ids: string[]) => ids.filter((id) => map.getLayer(id));
      const handleLayers = present([ROTATE_LAYER, SCALE_LAYER]);
      const moveLayers = present(["edit-fill", "edit-outline", POINT_MOVE_LAYER]);

      const hits = handleLayers.length
        ? map.queryRenderedFeatures(e.point, { layers: handleLayers })
        : [];
      let mode: Gesture["mode"] | null = null;
      if (hits.some((f) => f.layer.id === ROTATE_LAYER)) mode = "rotate";
      else if (hits.some((f) => f.layer.id === SCALE_LAYER)) mode = "scale";
      else if (
        moveLayers.length &&
        map.queryRenderedFeatures(e.point, { layers: moveLayers }).length
      ) {
        mode = "move";
      }
      if (!mode) return; // empty space → let the map pan normally

      const parent = draftRef.current;
      if (!parent) return;
      e.preventDefault();
      const center = geometryCenter(parent);
      const cosLat = Math.cos((center[1] * Math.PI) / 180) || 1;
      const dx = (e.lngLat.lng - center[0]) * cosLat;
      const dy = e.lngLat.lat - center[1];
      gesture = {
        mode,
        center,
        cosLat,
        startParent: parent,
        startChildren: childDraftsRef.current.map((c) => ({ ...c })),
        startLng: e.lngLat.lng,
        startLat: e.lngLat.lat,
        startAngle: Math.atan2(dy, dx),
        startDist: Math.hypot(dx, dy),
      };
      map.dragPan.disable();
      setCursor("grabbing");
    };

    const onMove = (e: MapMouseEvent | MapTouchEvent) => {
      if (!gesture) return;
      const { mode, center, cosLat, startParent, startChildren } = gesture;

      if (mode === "move") {
        const dLng = e.lngLat.lng - gesture.startLng;
        const dLat = e.lngLat.lat - gesture.startLat;
        paint(
          translateGeometry(startParent, dLng, dLat),
          startChildren.map((c) => ({
            id: c.id,
            geometry: translateGeometry(c.geometry, dLng, dLat),
          })),
        );
        return;
      }

      const dx = (e.lngLat.lng - center[0]) * cosLat;
      const dy = e.lngLat.lat - center[1];

      if (mode === "scale") {
        const dist = Math.hypot(dx, dy);
        const factor =
          gesture.startDist > 1e-9 ? Math.max(dist / gesture.startDist, 0.05) : 1;
        paint(
          scaleGeometry(startParent, factor, center),
          startChildren.map((c) => ({
            id: c.id,
            geometry: scaleGeometry(c.geometry, factor, center),
          })),
        );
        return;
      }

      // rotate
      const deg = ((Math.atan2(dy, dx) - gesture.startAngle) * 180) / Math.PI;
      paint(
        rotateGeometry(startParent, deg, center),
        startChildren.map((c) => ({
          id: c.id,
          geometry: rotateGeometry(c.geometry, deg, center),
        })),
      );
    };

    const onUp = () => {
      if (!gesture) return;
      gesture = null;
      map.dragPan.enable();
      setCursor("");
      const latest = latestRef.current;
      latestRef.current = null;
      if (latest) {
        // Commit once — refreshes React state and notifies the parent.
        draftRef.current = latest.parent;
        childDraftsRef.current = latest.children;
        setDraft(latest.parent);
        setChildDrafts(latest.children);
        onGeometryChangeRef.current?.(latest.parent, latest.children);
      }
    };

    map.on("mousedown", onDown);
    map.on("touchstart", onDown);
    map.on("mousemove", onMove);
    map.on("touchmove", onMove);
    map.on("mouseup", onUp);
    map.on("touchend", onUp);

    return () => {
      map.off("mousedown", onDown);
      map.off("touchstart", onDown);
      map.off("mousemove", onMove);
      map.off("touchmove", onMove);
      map.off("mouseup", onUp);
      map.off("touchend", onUp);
      map.dragPan.enable();
    };
  }, [editing]);

  const { areaLineCollection, pointCollection } = useMemo(() => {
    const areaLine: Feature[] = [];
    const points: Feature[] = [];
    const hiddenIds = new Set<string>(
      editGeometry ? [editGeometry.id, ...childDrafts.map((c) => c.id)] : [],
    );
    // Hierarchy depth (farm=0, field=1, bed=2, …) so a click over nested
    // polygons can prefer the deepest/most-specific feature instead of the
    // farm that contains everything. Cycle-guarded against bad parent data.
    // Plain object, not a Map() — "Map" here is the react-map-gl component.
    const parentById: Record<string, string | null> = {};
    for (const l of locations) parentById[l.id] = l.parentId;
    const depthOf = (id: string) => {
      let depth = 0;
      let cursor: string | null = parentById[id] ?? null;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        depth += 1;
        cursor = parentById[cursor] ?? null;
      }
      return depth;
    };
    for (const location of locations) {
      // Hide features being edited; the draft layers render them instead.
      if (hiddenIds.has(location.id)) continue;
      const feature: Feature = {
        type: "Feature",
        id: location.id,
        properties: {
          id: location.id,
          name: location.name,
          type: location.type,
          emoji: locationTypeEmoji(location.type),
          depth: depthOf(location.id),
          selected: selectedIdSet.has(location.id),
          grazeStatus: grazingStatus?.[location.id] ?? "",
          isDrop: location.id === dropTargetId,
        },
        geometry: location.geometry,
      };
      if (kindOf(location.geometry) === "point") points.push(feature);
      else areaLine.push(feature);
    }
    return {
      areaLineCollection: { type: "FeatureCollection" as const, features: areaLine },
      pointCollection: { type: "FeatureCollection" as const, features: points },
    };
  }, [locations, selectedIdSet, grazingStatus, dropTargetId, editGeometry, childDrafts]);

  // Live geometry for the children that move along with the edited parent, and
  // the bbox + resize/rotate handles — same shapes the drag handlers push.
  const childCollection = useMemo(() => childCollectionData(childDrafts), [childDrafts]);
  const gizmo = useMemo(() => (editing ? gizmoData(draft) : null), [editing, draft]);

  const drawGeometry = useMemo(
    () => (drawPoints && drawPoints.length ? pointsToGeometry(drawPoints) : null),
    [drawPoints],
  );

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (drawPoints) {
        onDrawPoint?.(event.lngLat.lng, event.lngLat.lat);
        return;
      }
      if (editing) return; // edits happen via gizmo drags
      if (dropMode) {
        onAddPin(event.lngLat.lng, event.lngLat.lat);
        return;
      }
      // A click over nested polygons (a bed inside a field inside a farm)
      // returns every overlapping feature. Prefer the deepest one in the
      // hierarchy so the child is selected, not the farm that contains it.
      const candidates = (event.features ?? []).filter((f) => f.properties?.id);
      let hit: (typeof candidates)[number] | null = null;
      for (const f of candidates) {
        if (!hit || (f.properties.depth ?? 0) > (hit.properties.depth ?? 0)) {
          hit = f;
        }
      }
      if (pickMode) {
        if (hit) onLocationPick?.(hit.properties!.id as string);
        return;
      }
      if (hit) {
        onSelectLocation(hit.properties!.id as string);
        return;
      }
      onSelectLocation(null);
    },
    [drawPoints, onDrawPoint, editing, dropMode, onAddPin, pickMode, onLocationPick, onSelectLocation],
  );

  const fillColor = [
    "case",
    ["==", ["get", "grazeStatus"], "grazing"],
    "#0ea5e9",
    ["==", ["get", "grazeStatus"], "ready"],
    "#10b981",
    ["==", ["get", "grazeStatus"], "resting"],
    "#f59e0b",
    ["==", ["get", "grazeStatus"], "idle"],
    "#a8a29e",
    [
      "match",
      ["get", "type"],
      "hoophouse",
      "#34d399",
      "bed",
      "#a3e635",
      "field",
      "#fcd34d",
      "zone",
      "#7dd3fc",
      "farm",
      "#d6d3d1",
      "paddock",
      "#86efac",
      "#34d399",
    ],
  ];

  const lineColor = [
    "match",
    ["get", "type"],
    "fence",
    "#92400e",
    "alley",
    "#a8a29e",
    "row",
    "#15803d",
    "#15803d",
  ];

  const pickActive = pickMode;
  const cursor = drawPoints
    ? "crosshair"
    : dropMode
      ? "crosshair"
      : pickActive
        ? "pointer"
        : "grab";

  return (
    <div className="relative h-full w-full touch-none">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        onMoveEnd={(evt) =>
          onCenterChange?.(evt.viewState.longitude, evt.viewState.latitude)
        }
        onClick={handleClick}
        onLoad={(evt) => {
          const c = evt.target.getCenter();
          onCenterChange?.(c.lng, c.lat);
          onMapReady?.(evt.target as unknown as MaplibreMap);
          mapReadyRef.current = true;
          if (locations.length > 0) fitToData();
          else centerOnGps();
        }}
        interactiveLayerIds={INTERACTIVE}
        mapStyle={SATELLITE_STYLE as unknown as string}
        style={{ width: "100%", height: "100%" }}
        cursor={cursor}
        attributionControl={false}
      >
        <NavigationControl position="bottom-left" showCompass={false} />

        <Source id="loc-areas" type="geojson" data={areaLineCollection}>
          <Layer
            id={AREA_LAYER}
            type="fill"
            filter={["==", ["geometry-type"], "Polygon"]}
            paint={{
              "fill-color": fillColor as unknown as string,
              "fill-opacity": [
                "case",
                ["get", "isDrop"],
                0.7,
                ["get", "selected"],
                0.55,
                pickActive ? 0.4 : 0.25,
              ] as unknown as number,
            }}
          />
          <Layer
            id="loc-area-outline"
            type="line"
            filter={["==", ["geometry-type"], "Polygon"]}
            paint={{
              "line-color": [
                "case",
                ["get", "isDrop"],
                "#065f46",
                fillColor,
              ] as unknown as string,
              "line-width": [
                "case",
                ["get", "isDrop"],
                4,
                ["get", "selected"],
                3,
                pickActive ? 2.5 : 1.5,
              ] as unknown as number,
            }}
          />
          <Layer
            id={LINE_LAYER}
            type="line"
            filter={["==", ["geometry-type"], "LineString"]}
            paint={{
              "line-color": lineColor as unknown as string,
              "line-width": ["case", ["get", "selected"], 5, 3],
            }}
          />
          <Layer
            id="loc-area-label"
            type="symbol"
            filter={["==", ["geometry-type"], "Polygon"]}
            layout={{
              "text-field": ["get", "name"],
              "text-size": 11,
              "text-anchor": "center",
              "text-allow-overlap": false,
            }}
            paint={{
              "text-color": "#ffffff",
              "text-halo-color": "#14532d",
              "text-halo-width": 1.6,
            }}
          />
        </Source>

        <Source id="loc-points" type="geojson" data={pointCollection}>
          {/* A white "puck" behind each emoji marker. Also the click/hit-test
              target for selecting a pin (the emoji markers are pointer-events:none). */}
          <Layer
            id={POINT_LAYER}
            type="circle"
            paint={{
              "circle-radius": [
                "case",
                ["get", "isDrop"],
                16,
                ["get", "selected"],
                15,
                pickActive ? 14 : 13,
              ] as unknown as number,
              "circle-color": ["case", ["get", "isDrop"], "#d1fae5", "#ffffff"] as unknown as string,
              "circle-stroke-color": [
                "case",
                ["get", "selected"],
                "#064e3b",
                ["get", "isDrop"],
                "#065f46",
                "#10b981",
              ] as unknown as string,
              "circle-stroke-width": ["case", ["get", "selected"], 3, 2] as unknown as number,
            }}
          />
          <Layer
            id="loc-point-label"
            type="symbol"
            layout={{
              "text-field": ["get", "name"],
              "text-size": 11,
              "text-offset": [0, 1.7],
              "text-anchor": "top",
              "text-allow-overlap": false,
            }}
            paint={{
              "text-color": "#ffffff",
              "text-halo-color": "#14532d",
              "text-halo-width": 1.6,
            }}
          />
        </Source>

        {/* Emoji glyphs for each pin. Rendered as HTML markers because MapLibre's
            SDF text layers can't render colour emoji. pointer-events:none keeps the
            white puck below as the click/drag target so selection still works. */}
        {pointCollection.features.map((f) => {
          const [lng, lat] = (f.geometry as { coordinates: [number, number] })
            .coordinates;
          return (
            <Marker
              key={f.properties.id}
              longitude={lng}
              latitude={lat}
              anchor="center"
              style={{ pointerEvents: "none" }}
            >
              <span
                aria-hidden
                style={{
                  fontSize: f.properties.selected ? 19 : 16,
                  lineHeight: 1,
                  filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))",
                }}
              >
                {f.properties.emoji}
              </span>
            </Marker>
          );
        })}

        {/* Children that move in relation to the edited parent (faint preview). */}
        {editing && childDrafts.length > 0 && (
          <Source id="edit-children" type="geojson" data={childCollection}>
            <Layer
              id="edit-children-fill"
              type="fill"
              filter={["==", ["geometry-type"], "Polygon"]}
              paint={{ "fill-color": "#10b981", "fill-opacity": 0.18 }}
            />
            <Layer
              id="edit-children-line"
              type="line"
              paint={{ "line-color": "#047857", "line-width": 1.5, "line-opacity": 0.8 }}
            />
            <Layer
              id="edit-children-point"
              type="circle"
              filter={["==", ["geometry-type"], "Point"]}
              paint={{
                "circle-radius": 5,
                "circle-color": "#10b981",
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
              }}
            />
          </Source>
        )}

        {/* Draft geometry being edited (fill + outline + a point-move handle). */}
        {editing && draft && (
          <Source id="edit-src" type="geojson" data={parentFeatureData(draft)}>
            {draft.type === "Polygon" && (
              <Layer
                id="edit-fill"
                type="fill"
                paint={{ "fill-color": "#10b981", "fill-opacity": 0.35 }}
              />
            )}
            {draft.type !== "Point" && (
              <Layer
                id="edit-outline"
                type="line"
                paint={{ "line-color": "#065f46", "line-width": 2.5 }}
              />
            )}
            {draft.type === "Point" && (
              <Layer
                id={POINT_MOVE_LAYER}
                type="circle"
                paint={{
                  "circle-radius": 11,
                  "circle-color": "#10b981",
                  "circle-stroke-color": "#065f46",
                  "circle-stroke-width": 3,
                }}
              />
            )}
          </Source>
        )}

        {/* Transform gizmo: dashed bbox, rotate arm + knob, corner resize handles. */}
        {editing && gizmo && (
          <>
            <Source id="edit-bbox" type="geojson" data={gizmo.bbox}>
              <Layer
                id="edit-bbox-line"
                type="line"
                paint={{
                  "line-color": "#ecfccb",
                  "line-width": 1.5,
                  "line-dasharray": [2, 2],
                  "line-opacity": 0.8,
                }}
              />
            </Source>
            <Source id="edit-rotate-line" type="geojson" data={gizmo.rotLine}>
              <Layer
                id="edit-rotate-arm"
                type="line"
                paint={{ "line-color": "#ecfccb", "line-width": 1.5, "line-opacity": 0.85 }}
              />
            </Source>
            <Source id="edit-scale-src" type="geojson" data={gizmo.corners}>
              <Layer
                id={SCALE_LAYER}
                type="circle"
                paint={{
                  "circle-radius": 8,
                  "circle-color": "#ffffff",
                  "circle-stroke-color": "#065f46",
                  "circle-stroke-width": 3,
                }}
              />
            </Source>
            <Source id="edit-rotate-src" type="geojson" data={gizmo.rotKnob}>
              <Layer
                id={ROTATE_LAYER}
                type="circle"
                paint={{
                  "circle-radius": 9,
                  "circle-color": "#065f46",
                  "circle-stroke-color": "#ffffff",
                  "circle-stroke-width": 3,
                }}
              />
            </Source>
          </>
        )}

        {/* In-progress drawing preview. */}
        {drawGeometry && (
          <Source id="draw-src" type="geojson" data={{ type: "Feature", properties: {}, geometry: drawGeometry }}>
            {drawGeometry.type === "Polygon" && (
              <Layer id="draw-fill" type="fill" paint={{ "fill-color": "#10b981", "fill-opacity": 0.3 }} />
            )}
            {drawGeometry.type !== "Point" && (
              <Layer id="draw-outline" type="line" paint={{ "line-color": "#065f46", "line-width": 2.5, "line-dasharray": [2, 1] }} />
            )}
          </Source>
        )}
        {drawPoints && drawPoints.length > 0 && (
          <Source id="draw-verts" type="geojson" data={vertexCollection(pointsToGeometry(drawPoints))}>
            <Layer
              id={VERTEX_LAYER}
              type="circle"
              paint={{
                "circle-radius": 6,
                "circle-color": "#10b981",
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
              }}
            />
          </Source>
        )}
      </Map>

      <MapFabCluster
        hasPlots={locations.length > 0}
        locating={locating}
        dropMode={dropMode}
        onFitToData={fitToData}
        onCenterGps={centerOnGps}
        onCapturePhoto={onCapturePhoto}
        onAskExpert={onAskExpert}
        actionsHidden={fabActionsHidden}
      />
    </div>
  );
}
