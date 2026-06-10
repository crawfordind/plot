"use client";

import { useCallback, useEffect, useState } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONGeometry, LocationRecord } from "@/lib/types";

type PlotMapProps = {
  locations: LocationRecord[];
  selectedLocationId: string | null;
  onSelectLocation: (id: string | null) => void;
  onAddPin: (lng: number, lat: number) => void;
  dropMode: boolean;
};

function getMarkerCoords(geometry: GeoJSONGeometry): [number, number] {
  if (geometry.type === "Point") {
    return geometry.coordinates;
  }
  const ring = geometry.coordinates[0];
  const lng = ring.reduce((sum, c) => sum + c[0], 0) / ring.length;
  const lat = ring.reduce((sum, c) => sum + c[1], 0) / ring.length;
  return [lng, lat];
}

export default function PlotMap({
  locations,
  selectedLocationId,
  onSelectLocation,
  onAddPin,
  dropMode,
}: PlotMapProps) {
  const [locating, setLocating] = useState(false);
  const [viewState, setViewState] = useState({
    longitude: -70.9,
    latitude: 43.2,
    zoom: 12,
  });
  const [gpsReady, setGpsReady] = useState(false);

  const centerOnGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setViewState({
          longitude: position.coords.longitude,
          latitude: position.coords.latitude,
          zoom: 15,
        });
        setGpsReady(true);
        setLocating(false);
      },
      () => {
        setGpsReady(false);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    centerOnGps();
  }, [centerOnGps]);

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (dropMode) {
        onAddPin(event.lngLat.lng, event.lngLat.lat);
        return;
      }
      onSelectLocation(null);
    },
    [dropMode, onAddPin, onSelectLocation],
  );

  return (
    <div className="relative h-full w-full touch-none">
      <Map
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        onClick={handleClick}
        mapStyle="https://tiles.openfreemap.org/styles/liberty"
        style={{ width: "100%", height: "100%" }}
        cursor={dropMode ? "crosshair" : "grab"}
        attributionControl={false}
      >
        <NavigationControl position="bottom-left" showCompass={false} />
        {locations.map((location) => {
          const [lng, lat] = getMarkerCoords(location.geometry);
          const selected = location.id === selectedLocationId;

          return (
            <Marker
              key={location.id}
              longitude={lng}
              latitude={lat}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectLocation(location.id);
              }}
            >
              <div
                className={`touch-target flex items-center justify-center rounded-full border-[3px] text-sm font-bold shadow-lg transition active:scale-95 ${
                  selected
                    ? "h-12 w-12 border-emerald-900 bg-emerald-600 text-white"
                    : "h-11 w-11 border-white bg-emerald-500 text-white"
                }`}
                title={location.name}
              >
                {location.type === "bed" ? "B" : location.type === "hoophouse" ? "H" : "•"}
              </div>
            </Marker>
          );
        })}
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
