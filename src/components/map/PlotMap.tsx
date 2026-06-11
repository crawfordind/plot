"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, NavigationControl, Source } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent, MapRef } from "react-map-gl/maplibre";
import type {
  Map as MaplibreMap,
  MapLayerMouseEvent as MlLayerMouseEvent,
  MapLayerTouchEvent as MlLayerTouchEvent,
  MapMouseEvent,
  MapTouchEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Icon from "@/components/ui/Icon";
import Tooltip from "@/components/ui/Tooltip";
import { LOCATION_LAYERS, VERTEX_LAYER } from "@/lib/map/dnd";
import { geometryVertices, moveVertex, pointsToGeometry, translateGeometry } from "@/lib/map/geometry";
import type { GeoJSONGeometry, LocationRecord, PaddockStatus } from "@/lib/types";

export type EditGeometry = { id: string; geometry: GeoJSONGeometry };

type PlotMapProps = {
  locations: LocationRecord[];
  selectedLocationId: string | null;
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
  // Edit an existing geometry by dragging vertices; emits the live draft.
  editGeometry?: EditGeometry | null;
  onGeometryChange?: (geometry: GeoJSONGeometry) => void;
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

function vertexCollection(geometry: GeoJSONGeometry | null) {
  const verts = geometry ? geometryVertices(geometry) : [];
  return {
    type: "FeatureCollection" as const,
    features: verts.map((c, idx) => ({
      type: "Feature" as const,
      properties: { idx },
      geometry: { type: "Point" as const, coordinates: c },
    })),
  };
}

export default function PlotMap({
  locations,
  selectedLocationId,
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
  onGeometryChange,
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
  const [seedId, setSeedId] = useState<string | null>(null);
  const editing = !!editGeometry;

  const currentEditId = editGeometry?.id ?? null;
  if (currentEditId !== seedId) {
    setSeedId(currentEditId);
    setDraft(editGeometry?.geometry ?? null);
  }

  // Keep a ref copy of the draft so the imperative drag handlers read the latest.
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const applyDraft = useCallback(
    (g: GeoJSONGeometry) => {
      draftRef.current = g;
      setDraft(g);
      onGeometryChange?.(g);
    },
    [onGeometryChange],
  );

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

  // Recenter when a location is selected (e.g. tapped in Records).
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !selectedLocationId) return;
    const loc = locations.find((l) => l.id === selectedLocationId);
    if (!loc) return;
    const c = centroidOf(loc.geometry);
    if (c) {
      map.flyTo({ center: c, zoom: Math.max(map.getZoom(), 16), duration: 500 });
    }
  }, [selectedLocationId, locations]);

  // Vertex / fill dragging for geometry edit mode. Attached imperatively to the
  // maplibre map so it works the same on touch and mouse.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !editing) return;

    let dragIdx: number | null = null;
    let translateStart: { lng: number; lat: number } | null = null;

    const setCursor = (c: string) => {
      map.getCanvas().style.cursor = c;
    };

    const onVertexDown = (e: MlLayerMouseEvent | MlLayerTouchEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      e.preventDefault();
      dragIdx = Number(feat.properties?.idx ?? -1);
      map.dragPan.disable();
      setCursor("grabbing");
    };

    const onFillDown = (e: MlLayerMouseEvent | MlLayerTouchEvent) => {
      // Only translate when not grabbing a vertex.
      if (dragIdx != null) return;
      e.preventDefault();
      translateStart = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      map.dragPan.disable();
      setCursor("grabbing");
    };

    const onMove = (e: MapMouseEvent | MapTouchEvent) => {
      const g = draftRef.current;
      if (!g) return;
      if (dragIdx != null && dragIdx >= 0) {
        applyDraft(moveVertex(g, dragIdx, e.lngLat.lng, e.lngLat.lat));
      } else if (translateStart) {
        const dLng = e.lngLat.lng - translateStart.lng;
        const dLat = e.lngLat.lat - translateStart.lat;
        translateStart = { lng: e.lngLat.lng, lat: e.lngLat.lat };
        applyDraft(translateGeometry(g, dLng, dLat));
      }
    };

    const onUp = () => {
      if (dragIdx == null && !translateStart) return;
      dragIdx = null;
      translateStart = null;
      map.dragPan.enable();
      setCursor("");
    };

    map.on("mousedown", VERTEX_LAYER, onVertexDown);
    map.on("touchstart", VERTEX_LAYER, onVertexDown);
    map.on("mousedown", "edit-fill", onFillDown);
    map.on("touchstart", "edit-fill", onFillDown);
    map.on("mousemove", onMove);
    map.on("touchmove", onMove);
    map.on("mouseup", onUp);
    map.on("touchend", onUp);

    return () => {
      map.off("mousedown", VERTEX_LAYER, onVertexDown);
      map.off("touchstart", VERTEX_LAYER, onVertexDown);
      map.off("mousedown", "edit-fill", onFillDown);
      map.off("touchstart", "edit-fill", onFillDown);
      map.off("mousemove", onMove);
      map.off("touchmove", onMove);
      map.off("mouseup", onUp);
      map.off("touchend", onUp);
      map.dragPan.enable();
    };
  }, [editing, applyDraft]);

  const { areaLineCollection, pointCollection } = useMemo(() => {
    const areaLine: Feature[] = [];
    const points: Feature[] = [];
    for (const location of locations) {
      // Hide the feature being edited; the draft layer renders it instead.
      if (editGeometry && location.id === editGeometry.id) continue;
      const feature: Feature = {
        type: "Feature",
        id: location.id,
        properties: {
          id: location.id,
          name: location.name,
          type: location.type,
          selected: location.id === selectedLocationId,
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
  }, [locations, selectedLocationId, grazingStatus, dropTargetId, editGeometry]);

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
      if (editing) return; // edits happen via vertex drags
      if (dropMode) {
        onAddPin(event.lngLat.lng, event.lngLat.lat);
        return;
      }
      const hit = event.features?.find((f) => f.properties?.id);
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
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
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
              "text-color": "#1c1917",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.4,
            }}
          />
        </Source>

        <Source id="loc-points" type="geojson" data={pointCollection}>
          <Layer
            id={POINT_LAYER}
            type="circle"
            paint={{
              "circle-radius": [
                "case",
                ["get", "isDrop"],
                11,
                ["get", "selected"],
                9,
                pickActive ? 8 : 7,
              ] as unknown as number,
              "circle-color": ["case", ["get", "isDrop"], "#065f46", "#10b981"] as unknown as string,
              "circle-stroke-color": ["case", ["get", "selected"], "#064e3b", "#ffffff"],
              "circle-stroke-width": 3,
            }}
          />
          <Layer
            id="loc-point-label"
            type="symbol"
            layout={{
              "text-field": ["get", "name"],
              "text-size": 11,
              "text-offset": [0, 1.2],
              "text-anchor": "top",
              "text-allow-overlap": false,
            }}
            paint={{
              "text-color": "#1c1917",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.4,
            }}
          />
        </Source>

        {/* Draft geometry being edited (fill + outline + draggable vertices). */}
        {editing && draft && (
          <Source id="edit-src" type="geojson" data={{ type: "Feature", properties: {}, geometry: draft }}>
            {draft.type === "Polygon" && (
              <Layer
                id="edit-fill"
                type="fill"
                paint={{ "fill-color": "#10b981", "fill-opacity": 0.35 }}
              />
            )}
            <Layer
              id="edit-outline"
              type="line"
              paint={{ "line-color": "#065f46", "line-width": 2.5 }}
            />
          </Source>
        )}
        {editing && draft && (
          <Source id="edit-verts" type="geojson" data={vertexCollection(draft)}>
            <Layer
              id={VERTEX_LAYER}
              type="circle"
              paint={{
                "circle-radius": 9,
                "circle-color": "#ffffff",
                "circle-stroke-color": "#065f46",
                "circle-stroke-width": 3,
              }}
            />
          </Source>
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
              id="draw-vertex"
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

      <div className="pointer-events-none absolute bottom-20 right-3 z-10 flex flex-col items-end gap-2">
        {locations.length > 0 && (
          <Tooltip text="Show all my plots" side="left">
            <button
              type="button"
              onClick={fitToData}
              aria-label="Show all my plots"
              className="focus-ring pointer-events-auto touch-target flex items-center justify-center rounded-full border border-white/80 bg-white/95 text-stone-600 shadow-lg backdrop-blur active:scale-95"
            >
              <Icon name="frame" size={20} />
            </button>
          </Tooltip>
        )}
        <Tooltip text="Center on my location" side="left">
          <button
            type="button"
            onClick={centerOnGps}
            aria-label="Center on my location"
            className="focus-ring pointer-events-auto touch-target flex items-center justify-center rounded-full border border-white/80 bg-white/95 text-stone-600 shadow-lg backdrop-blur active:scale-95"
          >
            {locating ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" />
            ) : (
              <Icon name="gps" size={20} />
            )}
          </button>
        </Tooltip>
        {dropMode && (
          <div className="pointer-events-none flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
            <Icon name="mapPin" size={14} />
            Tap map to drop a pin
          </div>
        )}
      </div>
    </div>
  );
}
