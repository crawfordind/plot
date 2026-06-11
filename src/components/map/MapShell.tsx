"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import CoachPanel from "@/components/coach/CoachPanel";
import CoachToast from "@/components/coach/CoachToast";
import RecordsPanel from "@/components/crud/RecordsPanel";
import GrazingPanel from "@/components/grazing/GrazingPanel";
import EventEditSheet from "@/components/events/EventEditSheet";
import EventForm from "@/components/events/EventForm";
import LogCapture from "@/components/log/LogCapture";
import LocationEditSheet from "@/components/locations/LocationEditSheet";
import LocationPanel from "@/components/locations/LocationPanel";
import AssetDragLayer, { type AssetDragHandle } from "@/components/map/AssetDragLayer";
import LocationSidebar from "@/components/map/LocationSidebar";
import {
  MapInteractionContext,
  type MapInteraction,
  type PickOptions,
} from "@/components/map/MapInteractionContext";
import MobileHeader from "@/components/map/MobileHeader";
import PlantingEditSheet from "@/components/plantings/PlantingEditSheet";
import PlantingForm from "@/components/plantings/PlantingForm";
import StructureBuilder from "@/components/structure/StructureBuilder";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Tour, { type TourHandle } from "@/components/ui/Tour";
import UndoToast from "@/components/ui/UndoToast";
import { polygonAreaAcres } from "@/lib/grazing/geo";
import type { GrazingSnapshot } from "@/lib/grazing/status";
import type { DragAsset } from "@/lib/map/dnd";
import { closePolygon } from "@/lib/map/geometry";
import type {
  CrossRecord,
  EventRecord,
  GeoJSONGeometry,
  GrazingEventRecord,
  HerdRecord,
  LocationRecord,
  PaddockRecord,
  PlantingRecord,
  SeasonRecord,
  VarietyRecord,
} from "@/lib/types";

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

async function patchJson(url: string, body: unknown) {
  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postJson(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export default function MapShell({ userName }: MapShellProps) {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [plantings, setPlantings] = useState<PlantingRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [herds, setHerds] = useState<HerdRecord[]>([]);
  const [paddockConfigs, setPaddockConfigs] = useState<PaddockRecord[]>([]);
  const [grazingEvents, setGrazingEvents] = useState<GrazingEventRecord[]>([]);
  const [grazingSnapshot, setGrazingSnapshot] = useState<GrazingSnapshot | null>(null);
  const [varieties, setVarieties] = useState<VarietyRecord[]>([]);
  const [crosses, setCrosses] = useState<CrossRecord[]>([]);
  const [seasons, setSeasons] = useState<SeasonRecord[]>([]);
  const [showGrazing, setShowGrazing] = useState(false);
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

  // Direct-manipulation state.
  const mapRef = useRef<MaplibreMap | null>(null);
  const dragLayerRef = useRef<AssetDragHandle>(null);
  const tourRef = useRef<TourHandle>(null);
  const [dragging, setDragging] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [pickOptions, setPickOptions] = useState<PickOptions | null>(null);
  const pickResolveRef = useRef<((id: string | null) => void) | null>(null);
  const [drawPoints, setDrawPoints] = useState<[number, number][] | null>(null);
  const [editLocation, setEditLocation] = useState<LocationRecord | null>(null);
  const [editDraft, setEditDraft] = useState<GeoJSONGeometry | null>(null);
  const [undo, setUndo] = useState<{ message: string; undo: () => Promise<void> } | null>(
    null,
  );

  const picking = !!pickOptions;

  const refreshData = useCallback(async () => {
    const [
      locationsRes,
      plantingsRes,
      eventsRes,
      herdsRes,
      paddocksRes,
      grazingEventsRes,
      advisorRes,
      varietiesRes,
      crossesRes,
      seasonsRes,
    ] = await Promise.all([
      fetch("/api/locations"),
      fetch("/api/plantings"),
      fetch("/api/events"),
      fetch("/api/grazing/herds"),
      fetch("/api/grazing/paddocks"),
      fetch("/api/grazing/events"),
      fetch("/api/grazing/advisor"),
      fetch("/api/varieties"),
      fetch("/api/crosses"),
      fetch("/api/seasons"),
    ]);

    if (locationsRes.ok) setLocations((await locationsRes.json()).locations);
    if (plantingsRes.ok) setPlantings((await plantingsRes.json()).plantings);
    if (eventsRes.ok) setEvents((await eventsRes.json()).events);
    if (herdsRes.ok) setHerds((await herdsRes.json()).herds);
    if (paddocksRes.ok) setPaddockConfigs((await paddocksRes.json()).paddocks);
    if (grazingEventsRes.ok)
      setGrazingEvents((await grazingEventsRes.json()).grazingEvents);
    if (advisorRes.ok) setGrazingSnapshot((await advisorRes.json()).grazing);
    if (varietiesRes.ok) setVarieties((await varietiesRes.json()).varieties);
    if (crossesRes.ok) setCrosses((await crossesRes.json()).crosses);
    if (seasonsRes.ok) setSeasons((await seasonsRes.json()).seasons);
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

  const manipulating = picking || !!drawPoints || !!editLocation || dragging;

  const overlayOpen =
    !!selectedLocation ||
    !!pendingCoords ||
    showRecords ||
    showEventForm ||
    showPlantingForm ||
    showBuilder ||
    showGrazing ||
    !!editingLocation ||
    !!editingPlanting ||
    !!editingEvent ||
    manipulating;

  const closeAllSheets = useCallback(() => {
    setSelectedLocationId(null);
    setPendingCoords(null);
    setShowRecords(false);
    setShowEventForm(false);
    setShowPlantingForm(false);
    setShowBuilder(false);
    setShowGrazing(false);
    setEditingLocation(null);
    setEditingPlanting(null);
    setEditingEvent(null);
    setDropMode(false);
  }, []);

  // ---- Map interaction context ----

  const requestPick = useCallback((opts: PickOptions) => {
    setLogCollapsed(true);
    return new Promise<string | null>((resolve) => {
      pickResolveRef.current = resolve;
      setPickOptions(opts);
    });
  }, []);

  const resolvePick = useCallback((id: string | null) => {
    setPickOptions(null);
    const resolve = pickResolveRef.current;
    pickResolveRef.current = null;
    resolve?.(id);
  }, []);

  const beginDrag = useCallback((asset: DragAsset, e: React.PointerEvent) => {
    e.preventDefault();
    setLogCollapsed(true);
    setDragging(true);
    dragLayerRef.current?.begin(asset, e.pointerId, e.clientX, e.clientY);
  }, []);

  const startDrawPaddock = useCallback(() => {
    closeAllSheets();
    setEditLocation(null);
    setDrawPoints([]);
  }, [closeAllSheets]);

  const startEditGeometry = useCallback(
    (location: LocationRecord) => {
      closeAllSheets();
      setDrawPoints(null);
      setEditLocation(location);
      setEditDraft(location.geometry);
    },
    [closeAllSheets],
  );

  const interaction = useMemo<MapInteraction>(
    () => ({ picking, requestPick, beginDrag, startEditGeometry, startDrawPaddock }),
    [picking, requestPick, beginDrag, startEditGeometry, startDrawPaddock],
  );

  // ---- Drag drop → API move (instant + Undo) ----

  const handleDrop = useCallback(
    async (asset: DragAsset, targetId: string) => {
      setDragging(false);
      setDropTargetId(null);
      const targetName = locations.find((l) => l.id === targetId)?.name ?? "new spot";

      try {
        if (asset.kind === "planting") {
          await patchJson(`/api/plantings/${asset.id}`, { locationId: targetId });
          if (asset.fromLocationId) {
            const from = asset.fromLocationId;
            setUndo({
              message: `Moved ${asset.label} → ${targetName}`,
              undo: async () => {
                await patchJson(`/api/plantings/${asset.id}`, { locationId: from });
                refreshData();
              },
            });
          }
        } else if (asset.kind === "event") {
          await patchJson(`/api/events/${asset.id}`, { locationId: targetId });
          const from = asset.fromLocationId;
          setUndo({
            message: `Moved log → ${targetName}`,
            undo: async () => {
              await patchJson(`/api/events/${asset.id}`, { locationId: from });
              refreshData();
            },
          });
        } else if (asset.kind === "herd") {
          const res = await postJson(`/api/grazing/move`, {
            herdId: asset.id,
            toLocationId: targetId,
          });
          const data = await res.json().catch(() => null);
          const openedId: string | undefined = data?.opened?.id;
          const closedId: string | undefined = data?.closed?.id;
          // Undo works even for a never-placed herd: delete the period we opened
          // and re-open the one we closed (if any).
          setUndo({
            message: `Moved ${asset.label} → ${targetName}`,
            undo: async () => {
              if (openedId) {
                await fetch(`/api/grazing/events/${openedId}`, { method: "DELETE" });
              }
              if (closedId) {
                await patchJson(`/api/grazing/events/${closedId}`, {
                  movedOutAt: null,
                  heightOutIn: null,
                });
              }
              refreshData();
            },
          });
        }
        refreshData();
        setCoachRefreshKey((k) => k + 1);
      } catch {
        // network error — leave state; user can retry
      }
    },
    [locations, refreshData],
  );

  // ---- Draw / edit geometry actions ----

  const drawArea = useMemo(() => {
    const g = drawPoints && drawPoints.length >= 3 ? closePolygon(drawPoints) : null;
    return g ? polygonAreaAcres(g) : 0;
  }, [drawPoints]);

  const editArea = useMemo(
    () => (editDraft && editDraft.type === "Polygon" ? polygonAreaAcres(editDraft) : 0),
    [editDraft],
  );

  async function finishDraw() {
    if (!drawPoints || drawPoints.length < 3) return;
    const geometry = closePolygon(drawPoints);
    if (!geometry) return;
    const count = locations.filter((l) => l.type === "paddock").length + 1;
    const res = await postJson("/api/locations", {
      name: `Paddock ${count}`,
      type: "paddock",
      geometry,
    });
    if (res.ok) {
      const data = await res.json();
      const locId = data.location?.id;
      if (locId) {
        await postJson("/api/grazing/paddocks", {
          locationId: locId,
          restTargetDays: 30,
        });
      }
    }
    setDrawPoints(null);
    handleDataSaved("Paddock added.");
  }

  async function saveGeometry() {
    if (!editLocation || !editDraft) return;
    await patchJson(`/api/locations/${editLocation.id}`, { geometry: editDraft });
    setEditLocation(null);
    setEditDraft(null);
    handleDataSaved("Shape updated.");
  }

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
    <MapInteractionContext.Provider value={interaction}>
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
          onOpenGrazing={() => {
            setShowGrazing(true);
            setLogCollapsed(true);
          }}
          onDrawPaddock={startDrawPaddock}
          onHelp={() => tourRef.current?.start()}
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
            grazingStatus={grazingSnapshot?.statusByLocation}
            onMapReady={(m) => {
              mapRef.current = m;
            }}
            pickMode={picking}
            onLocationPick={(id) => {
              if (pickOptions?.types?.length) {
                const loc = locations.find((l) => l.id === id);
                if (!loc || !pickOptions.types.includes(loc.type)) return;
              }
              resolvePick(id);
            }}
            dropTargetId={dropTargetId}
            drawPoints={drawPoints}
            onDrawPoint={(lng, lat) =>
              setDrawPoints((p) => [...(p ?? []), [lng, lat]])
            }
            editGeometry={
              editLocation
                ? { id: editLocation.id, geometry: editLocation.geometry }
                : null
            }
            onGeometryChange={setEditDraft}
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

          {locations.length === 0 &&
            !dropMode &&
            !pendingCoords &&
            !overlayOpen && (
              <div className="absolute inset-x-0 top-[18%] flex justify-center px-6">
                <div className="max-w-xs rounded-3xl border border-emerald-100 bg-white/95 px-5 py-5 text-center shadow-xl backdrop-blur">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <Icon name="leaf" size={26} />
                  </span>
                  <p className="mt-3 text-lg font-bold text-stone-900">Welcome to Plot</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
                    Describe your farm in a sentence and we&apos;ll map it — beds, hoop
                    houses, rows and all.
                  </p>
                  <Button
                    fullWidth
                    leftIcon="layers"
                    onClick={() => setShowBuilder(true)}
                    className="mt-4"
                  >
                    Describe my farm
                  </Button>
                  <p className="mt-2 text-xs text-stone-400">
                    or tap <strong>Pin</strong> to drop one spot at a time
                  </p>
                </div>
              </div>
            )}

          {/* Tap-to-place instruction bar */}
          {picking && (
            <div className="absolute inset-x-3 bottom-4 z-30 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-900 px-4 py-3 text-sm text-emerald-50 shadow-xl">
              <p className="min-w-0 truncate font-medium">{pickOptions?.title}</p>
              <button
                type="button"
                onClick={() => resolvePick(null)}
                className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold active:bg-white/20"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Draw paddock toolbar */}
          {drawPoints && (
            <div className="absolute inset-x-3 bottom-4 z-30 rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-800">Draw a paddock</p>
                <p className="text-sm text-emerald-700">
                  {drawPoints.length} pts · {drawArea.toFixed(2)} ac
                </p>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Tap the map to add corners. Need at least 3.
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setDrawPoints(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  leftIcon="undo"
                  className="flex-1"
                  disabled={drawPoints.length === 0}
                  onClick={() => setDrawPoints((p) => (p ? p.slice(0, -1) : p))}
                >
                  Point
                </Button>
                <Button
                  leftIcon="check"
                  className="flex-[1.4]"
                  disabled={drawPoints.length < 3}
                  onClick={finishDraw}
                >
                  Finish
                </Button>
              </div>
            </div>
          )}

          {/* Resize / move geometry toolbar */}
          {editLocation && (
            <div className="absolute inset-x-3 bottom-4 z-30 rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-800">
                  Reshape {editLocation.name}
                </p>
                {editDraft?.type === "Polygon" && (
                  <p className="text-sm text-emerald-700">{editArea.toFixed(2)} ac</p>
                )}
              </div>
              <p className="mt-1 text-xs text-stone-500">
                {editDraft?.type === "Polygon"
                  ? "Drag the handles to resize, or drag the middle to move it."
                  : "Drag the handle to reposition it."}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setEditLocation(null);
                    setEditDraft(null);
                  }}
                >
                  Cancel
                </Button>
                <Button leftIcon="check" className="flex-[1.4]" onClick={saveGeometry}>
                  Save shape
                </Button>
              </div>
            </div>
          )}

          {coachToast && !overlayOpen && (
            <CoachToast message={coachToast} onDismiss={() => setCoachToast(null)} />
          )}
        </div>

        {!overlayOpen && (
          <div data-tour="log" className="shrink-0">
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
          </div>
        )}

        <LocationPanel
          pendingCoords={pendingCoords}
          onCancel={() => setPendingCoords(null)}
          onCreated={() =>
            handleDataSaved("Location saved. Drop more pins or start logging.")
          }
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

        {showGrazing && (
          <GrazingPanel
            locations={locations}
            herds={herds}
            paddockConfigs={paddockConfigs}
            grazingEvents={grazingEvents}
            snapshot={grazingSnapshot}
            hidden={dragging || picking}
            onChanged={refreshData}
            onClose={() => setShowGrazing(false)}
          />
        )}

        {selectedLocation && (
          <LocationSidebar
            location={selectedLocation}
            plantings={locationPlantings}
            events={locationEvents}
            hidden={dragging || picking}
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
            varieties={varieties}
            crosses={crosses}
            seasons={seasons}
            onChanged={refreshData}
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
            varieties={varieties}
            seasons={seasons}
            defaultLocationId={selectedLocationId}
            onSaved={() => handleDataSaved("Planting created.")}
            onVarietyCreated={refreshData}
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
            varieties={varieties}
            plantings={plantings}
            crosses={crosses}
            onSaved={() => handleDataSaved("Planting updated.")}
            onDeleted={() => handleDataSaved("Planting deleted.")}
            onChanged={refreshData}
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

        {/* Always-mounted so it can capture the pointer the instant a drag starts. */}
        <AssetDragLayer
          ref={dragLayerRef}
          getMap={() => mapRef.current}
          onHoverTarget={setDropTargetId}
          onDrop={handleDrop}
          onCancel={() => {
            setDragging(false);
            setDropTargetId(null);
          }}
        />

        {undo && (
          <UndoToast
            message={undo.message}
            onUndo={undo.undo}
            onDismiss={() => setUndo(null)}
          />
        )}

        <Tour ref={tourRef} />
      </div>
    </MapInteractionContext.Provider>
  );
}
