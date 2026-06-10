"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import CoachPanel from "@/components/coach/CoachPanel";
import CoachToast from "@/components/coach/CoachToast";
import RecordsPanel from "@/components/crud/RecordsPanel";
import EventEditSheet from "@/components/events/EventEditSheet";
import EventForm from "@/components/events/EventForm";
import LogCapture from "@/components/log/LogCapture";
import LocationEditSheet from "@/components/locations/LocationEditSheet";
import LocationPanel from "@/components/locations/LocationPanel";
import LocationSidebar from "@/components/map/LocationSidebar";
import MobileHeader from "@/components/map/MobileHeader";
import PlantingEditSheet from "@/components/plantings/PlantingEditSheet";
import PlantingForm from "@/components/plantings/PlantingForm";
import StructureBuilder from "@/components/structure/StructureBuilder";
import type { EventRecord, LocationRecord, PlantingRecord } from "@/lib/types";

const PlotMap = dynamic(() => import("@/components/map/PlotMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-emerald-50 text-sm text-stone-500">
      Loading map…
    </div>
  ),
});

type MapShellProps = {
  userName: string | null;
};

export default function MapShell({ userName }: MapShellProps) {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [plantings, setPlantings] = useState<PlantingRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [dropMode, setDropMode] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<[number, number] | null>(null);
  const [showRecords, setShowRecords] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showPlantingForm, setShowPlantingForm] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [editingLocation, setEditingLocation] = useState<LocationRecord | null>(null);
  const [editingPlanting, setEditingPlanting] = useState<PlantingRecord | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [coachRefreshKey, setCoachRefreshKey] = useState(0);
  const [logStarter, setLogStarter] = useState<string | undefined>();
  const [coachToast, setCoachToast] = useState<string | null>(null);
  const [logCollapsed, setLogCollapsed] = useState(false);

  const refreshData = useCallback(async () => {
    const [locationsRes, plantingsRes, eventsRes] = await Promise.all([
      fetch("/api/locations"),
      fetch("/api/plantings"),
      fetch("/api/events"),
    ]);

    if (locationsRes.ok) {
      const data = await locationsRes.json();
      setLocations(data.locations);
    }
    if (plantingsRes.ok) {
      const data = await plantingsRes.json();
      setPlantings(data.plantings);
    }
    if (eventsRes.ok) {
      const data = await eventsRes.json();
      setEvents(data.events);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const selectedLocation = locations.find((l) => l.id === selectedLocationId) ?? null;
  const locationEvents = selectedLocation
    ? events.filter((e) => e.locationId === selectedLocation.id)
    : [];
  const locationPlantings = selectedLocation
    ? plantings.filter((p) => p.locationId === selectedLocation.id)
    : [];

  const overlayOpen =
    !!selectedLocation ||
    !!pendingCoords ||
    showRecords ||
    showEventForm ||
    showPlantingForm ||
    showBuilder ||
    !!editingLocation ||
    !!editingPlanting ||
    !!editingEvent;

  function handleLocationDeleted() {
    setSelectedLocationId(null);
    refreshData();
    setCoachRefreshKey((k) => k + 1);
  }

  function handleDataSaved(coachMessage?: string) {
    refreshData();
    setCoachRefreshKey((k) => k + 1);
    if (coachMessage) setCoachToast(coachMessage);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <MobileHeader
        userName={userName}
        dropMode={dropMode}
        onToggleDropMode={() => {
          setDropMode((v) => !v);
          setPendingCoords(null);
          setLogCollapsed(true);
        }}
        onOpenRecords={() => setShowRecords(true)}
        onOpenBuilder={() => {
          setShowBuilder(true);
          setLogCollapsed(true);
        }}
        onLogout={handleLogout}
      />

      <div className="relative min-h-0 flex-1">
        <PlotMap
          locations={locations}
          selectedLocationId={selectedLocationId}
          onSelectLocation={(id) => {
            setSelectedLocationId(id);
            if (id) setLogCollapsed(true);
          }}
          onAddPin={(lng, lat) => {
            setPendingCoords([lng, lat]);
            setDropMode(false);
            setLogCollapsed(true);
          }}
          onCenterChange={(lng, lat) => setMapCenter([lng, lat])}
          dropMode={dropMode}
        />

        <CoachPanel
          selectedLocationId={selectedLocationId}
          refreshKey={coachRefreshKey}
          onStarterSelect={(text) => {
            setLogStarter(text);
            setLogCollapsed(false);
          }}
          hidden={overlayOpen}
        />

        {locations.length === 0 && !dropMode && !pendingCoords && !overlayOpen && (
          <div className="absolute inset-x-0 top-1/4 flex justify-center px-6">
            <div className="max-w-xs rounded-2xl border border-emerald-100 bg-white/95 px-5 py-4 text-center shadow-lg backdrop-blur">
              <p className="text-base font-semibold text-stone-900">Welcome to Plot</p>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                Describe your farm in a sentence and we&apos;ll map it — beds, hoop houses,
                rows and all.
              </p>
              <button
                type="button"
                onClick={() => setShowBuilder(true)}
                className="touch-target mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white active:bg-emerald-700"
              >
                Describe my farm
              </button>
              <p className="mt-2 text-xs text-stone-400">
                or tap <strong>Pin</strong> to drop one spot at a time
              </p>
            </div>
          </div>
        )}

        {coachToast && !overlayOpen && (
          <CoachToast message={coachToast} onDismiss={() => setCoachToast(null)} />
        )}
      </div>

      {!overlayOpen && (
        <LogCapture
          locations={locations}
          plantings={plantings}
          selectedLocationId={selectedLocationId}
          onSaved={handleDataSaved}
          onManualForm={() => setShowEventForm(true)}
          starterText={logStarter}
          onStarterConsumed={() => setLogStarter(undefined)}
          collapsed={logCollapsed}
          onCollapsedChange={setLogCollapsed}
        />
      )}

      <LocationPanel
        pendingCoords={pendingCoords}
        onCancel={() => setPendingCoords(null)}
        onCreated={() => handleDataSaved("Location saved. Drop more pins or start logging.")}
      />

      {showBuilder && (
        <StructureBuilder
          anchor={mapCenter ? { lng: mapCenter[0], lat: mapCenter[1] } : null}
          onCreated={(count) => {
            setShowBuilder(false);
            handleDataSaved(`Mapped ${count} locations. Tap any one to start logging.`);
          }}
          onClose={() => setShowBuilder(false)}
        />
      )}

      {selectedLocation && (
        <LocationSidebar
          location={selectedLocation}
          plantings={locationPlantings}
          events={locationEvents}
          onEditLocation={() => setEditingLocation(selectedLocation)}
          onAddPlanting={() => setShowPlantingForm(true)}
          onEditPlanting={setEditingPlanting}
          onEditEvent={setEditingEvent}
          onClose={() => setSelectedLocationId(null)}
        />
      )}

      {showRecords && (
        <RecordsPanel
          locations={locations}
          plantings={plantings}
          events={events}
          onEditLocation={(location) => {
            setSelectedLocationId(location.id);
            setEditingLocation(location);
            setShowRecords(false);
          }}
          onEditPlanting={(planting) => {
            setEditingPlanting(planting);
            setShowRecords(false);
          }}
          onEditEvent={(event) => {
            setEditingEvent(event);
            setShowRecords(false);
          }}
          onAddLocation={() => {
            setShowRecords(false);
            setDropMode(true);
            setLogCollapsed(true);
          }}
          onAddPlanting={() => {
            setShowRecords(false);
            setShowPlantingForm(true);
          }}
          onAddEvent={() => {
            setShowRecords(false);
            setLogCollapsed(false);
          }}
          onClose={() => setShowRecords(false)}
        />
      )}

      {showEventForm && (
        <EventForm
          locations={locations}
          plantings={plantings}
          defaultLocationId={selectedLocationId}
          onSaved={() => handleDataSaved("Event saved.")}
          onClose={() => setShowEventForm(false)}
        />
      )}

      {showPlantingForm && (
        <PlantingForm
          locations={locations}
          defaultLocationId={selectedLocationId}
          onSaved={() => handleDataSaved("Planting created.")}
          onClose={() => setShowPlantingForm(false)}
        />
      )}

      {editingLocation && (
        <LocationEditSheet
          location={editingLocation}
          onSaved={() => handleDataSaved("Location updated.")}
          onDeleted={handleLocationDeleted}
          onClose={() => setEditingLocation(null)}
        />
      )}

      {editingPlanting && (
        <PlantingEditSheet
          planting={editingPlanting}
          locations={locations}
          onSaved={() => handleDataSaved("Planting updated.")}
          onDeleted={() => handleDataSaved("Planting deleted.")}
          onClose={() => setEditingPlanting(null)}
        />
      )}

      {editingEvent && (
        <EventEditSheet
          event={editingEvent}
          locations={locations}
          plantings={plantings}
          onSaved={() => handleDataSaved("Log updated.")}
          onDeleted={() => handleDataSaved("Log deleted.")}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  );
}
