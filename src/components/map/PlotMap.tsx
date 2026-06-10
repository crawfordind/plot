"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Map, { Layer, NavigationControl, Source } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONGeometry, LocationRecord } from "@/lib/types";

type PlotMapProps = {
  locations: LocationRecord[];
  selectedLocationId: string | null;
  onSelectLocation: (id: string | null) => void;
  onAddPin: (lng: number, lat: number) => void;
  onCenterChange?: (lng: number, lat: number) => void;
  dropMode: boolean;
};

const AREA_LAYER = "loc-area-fill";
const LINE_LAYER = "loc-line";
const POINT_LAYER = "loc-point";
const INTERACTIVE = [AREA_LAYER, LINE_LAYER, POINT_LAYER];

type Feature = {
  type: "Feature";
  id?: string;
  properties: { id: string; name: string; type: string; selected: boolean };
  geometry: GeoJSONGeometry;
};

function kindOf(geometry: GeoJSONGeometry): "area" | "line" | "point" {
  if (geometry.type === "Polygon") return "area";
  if (geometry.type === "LineString") return "line";
  return "point";
}

export default function PlotMap({
  locations,
  selectedLocationId,
  onSelectLocation,
  onAddPin,
  onCenterChange,
  dropMode,
}: PlotMapProps) {
  const [locating, setLocating] = useState(false);
  const [viewState, setViewState] = useState({
    longitude: -70.9,
    latitude: 43.2,
    zoom: 12,
  });

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
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [onCenterChange]);

  useEffect(() => {
    centerOnGps();
  }, [centerOnGps]);

  // Split locations into a polygon/line FeatureCollection and point markers.
  const { areaLineCollection, pointCollection } = useMemo(() => {
    const areaLine: Feature[] = [];
    const points: Feature[] = [];
    for (const location of locations) {
      const feature: Feature = {
        type: "Feature",
        id: location.id,
        properties: {
          id: location.id,
          name: location.name,
          type: location.type,
          selected: location.id === selectedLocationId,
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
  }, [locations, selectedLocationId]);

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (dropMode) {
        onAddPin(event.lngLat.lng, event.lngLat.lat);
        return;
      }
      const hit = event.features?.find((f) => f.properties?.id);
      if (hit) {
        onSelectLocation(hit.properties!.id as string);
        return;
      }
      onSelectLocation(null);
    },
    [dropMode, onAddPin, onSelectLocation],
  );

  const fillColor = [
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
    "#34d399",
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

  return (
    <div className="relative h-full w-full touch-none">
      <Map
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        onMoveEnd={(evt) =>
          onCenterChange?.(evt.viewState.longitude, evt.viewState.latitude)
        }
        onClick={handleClick}
        onLoad={(evt) => {
          const c = evt.target.getCenter();
          onCenterChange?.(c.lng, c.lat);
        }}
        interactiveLayerIds={INTERACTIVE}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        style={{ width: "100%", height: "100%" }}
        cursor={dropMode ? "crosshair" : "grab"}
        attributionControl={false}
      >
        <NavigationControl position="bottom-left" showCompass={false} />

        <Source id="loc-areas" type="geojson" data={areaLineCollection}>
          {/* Polygon fills */}
          <Layer
            id={AREA_LAYER}
            type="fill"
            filter={["==", ["geometry-type"], "Polygon"]}
            paint={{
              "fill-color": fillColor as unknown as string,
              "fill-opacity": ["case", ["get", "selected"], 0.55, 0.25],
            }}
          />
          {/* Polygon outlines */}
          <Layer
            id="loc-area-outline"
            type="line"
            filter={["==", ["geometry-type"], "Polygon"]}
            paint={{
              "line-color": fillColor as unknown as string,
              "line-width": ["case", ["get", "selected"], 3, 1.5],
            }}
          />
          {/* Rows / alleys / fences */}
          <Layer
            id={LINE_LAYER}
            type="line"
            filter={["==", ["geometry-type"], "LineString"]}
            paint={{
              "line-color": lineColor as unknown as string,
              "line-width": ["case", ["get", "selected"], 5, 3],
            }}
          />
          {/* Labels for areas */}
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
              "circle-radius": ["case", ["get", "selected"], 9, 7],
              "circle-color": "#10b981",
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
      </Map>

      <div className="pointer-events-none absolute bottom-20 right-3 z-10 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={centerOnGps}
          aria-label="Center on my location"
          className="pointer-events-auto touch-target flex items-center justify-center rounded-full border border-white/80 bg-white/95 text-base shadow-lg backdrop-blur active:scale-95"
        >
          {locating ? "…" : "◎"}
        </button>
        {dropMode && (
          <div className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
            Tap map to drop pin
          </div>
        )}
      </div>
    </div>
  );
}
