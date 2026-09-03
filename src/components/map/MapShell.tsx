"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import CoachPanel from "@/components/coach/CoachPanel";
import CoachToast from "@/components/coach/CoachToast";
import ExpertChat from "@/components/experts/ExpertChat";
import RecordsPanel from "@/components/crud/RecordsPanel";
import GrazingPanel from "@/components/grazing/GrazingPanel";
import EventEditSheet from "@/components/events/EventEditSheet";
import EventForm from "@/components/events/EventForm";
import ChatDock from "@/components/map/ChatDock";
import LocationEditSheet from "@/components/locations/LocationEditSheet";
import LocationPanel from "@/components/locations/LocationPanel";
import AssetDragLayer, { type AssetDragHandle } from "@/components/map/AssetDragLayer";
import FarmBar from "@/components/map/FarmBar";
import LocationSidebar from "@/components/map/LocationSidebar";
import {
  MapInteractionContext,
  type MapInteraction,
  type PickOptions,
} from "@/components/map/MapInteractionContext";
import MobileHeader from "@/components/map/MobileHeader";
import NewFarmSheet from "@/components/map/NewFarmSheet";
import TakePhotoSheet from "@/components/map/TakePhotoSheet";
import SelectionBar from "@/components/map/SelectionBar";
import WorkspacePanel from "@/components/workspace/WorkspacePanel";
import PlantingEditSheet from "@/components/plantings/PlantingEditSheet";
import PlantingForm from "@/components/plantings/PlantingForm";
import StructureBuilder from "@/components/structure/StructureBuilder";
import TagMode from "@/components/tags/TagMode";
import TagScanSheet from "@/components/tags/TagScanSheet";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Tour, { type TourHandle } from "@/components/ui/Tour";
import { useToast } from "@/components/ui/toast/ToastProvider";
import UndoToast from "@/components/ui/UndoToast";
import { apiFetch, getErrorMessage } from "@/lib/client";
import type { GeocodeResult } from "@/lib/geocode";
import { polygonAreaAcres } from "@/lib/grazing/geo";
import type { GrazingSnapshot } from "@/lib/grazing/status";
import type { DragAsset } from "@/lib/map/dnd";
import {
  boundsPolygon,
  closePolygon,
  farmAtPoint,
  geometryBounds,
  geometryCenter,
  translateGeometry,
} from "@/lib/map/geometry";
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

type ChildGeometry = { id: string; geometry: GeoJSONGeometry };

const CURRENT_FARM_KEY = "plot:currentFarmId";

// IDs of every location nested under `rootId` (children, grandchildren, …).
function descendantIds(all: LocationRecord[], rootId: string): Set<string> {
  const childrenBy = new Map<string | null, LocationRecord[]>();
  for (const l of all) {
    const arr = childrenBy.get(l.parentId) ?? [];
    arr.push(l);
    childrenBy.set(l.parentId, arr);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of childrenBy.get(id) ?? []) {
      if (!out.has(c.id)) {
        out.add(c.id);
        stack.push(c.id);
      }
    }
  }
  return out;
}

// The "group" a clicked location belongs to: the top-level container directly
// under its farm (e.g. a bed → its Field). Walks up until the next ancestor is a
// farm. Returns null for a farm itself (farms are adjusted via the farm switcher,
// not selected by tapping inside them). Cycle-guarded against bad parent data.
function groupRootId(all: LocationRecord[], id: string): string | null {
  const byId = new Map(all.map((l) => [l.id, l]));
  let node = byId.get(id);
  if (!node || node.type === "farm") return null;
  const seen = new Set<string>([node.id]);
  while (node.parentId) {
    const parent = byId.get(node.parentId);
    if (!parent || parent.type === "farm") break;
    if (seen.has(parent.id)) break;
    seen.add(parent.id);
    node = parent;
  }
  return node.id;
}

async function patchJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Throw on non-2xx so callers' try/catch actually fires instead of silently
  // treating a rejected save as success.
  if (!res.ok) throw new Error(`PATCH ${url} failed (${res.status})`);
  return res;
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
  const [showWorkspace, setShowWorkspace] = useState(false);
  // Selection model. A tap selects a top-level GROUP (a farm's direct child, e.g.
  // a Field) so the whole assembly moves/resizes/deletes together. Tapping again
  // drills into a specific child; "Select parts" mode toggles several children.
  const [selection, setSelection] = useState<{
    groupId: string;
    childIds: string[];
  } | null>(null);
  const [partsMode, setPartsMode] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  // Tag mode arms the NFC reader for a whole walk. `scannedTagCode` is set when
  // a tag that already carries one of our codes reads — that's a visit, not a
  // write, so it opens the scan landing instead of the bind sheet.
  const [tagMode, setTagMode] = useState(false);
  const [scannedTagCode, setScannedTagCode] = useState<string | null>(null);
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
  const toast = useToast();
  // False until the first locations fetch resolves, so the "Welcome to Plot"
  // empty state doesn't flash for returning users while data is still loading.
  const [loaded, setLoaded] = useState(false);
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
  const [drawKind, setDrawKind] = useState<"paddock" | "farm">("paddock");
  const [farmDraftName, setFarmDraftName] = useState<string | null>(null);
  const [showNewFarm, setShowNewFarm] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [showChat, setShowChat] = useState(false);
  // Text to auto-send when the chat opens from the bottom dock (it "expands" the
  // dock into the full conversation).
  const [chatSeed, setChatSeed] = useState<string | undefined>();
  // Geometry-edit targets: the ids the user chose to transform. One id edits that
  // location (its descendants follow). Several ids transform together via a
  // synthetic bounding-box gizmo.
  const [editIds, setEditIds] = useState<string[] | null>(null);
  const [editDraft, setEditDraft] = useState<GeoJSONGeometry | null>(null);
  const [editChildDrafts, setEditChildDrafts] = useState<ChildGeometry[]>([]);
  const [currentFarmId, setCurrentFarmId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const initialFarmZoomRef = useRef(false);
  const [undo, setUndo] = useState<{ message: string; undo: () => Promise<void> } | null>(
    null,
  );

  const picking = !!pickOptions;
  const farms = useMemo(() => locations.filter((l) => l.type === "farm"), [locations]);

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
    if (locationsRes.ok) setLoaded(true);
  }, []);

  useEffect(() => {
    // Load-on-mount: setState happens inside refreshData's awaited fetch
    // callbacks (a microtask later), not synchronously in this effect body, so
    // this is a legitimate "sync with external system" effect, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshData();
  }, [refreshData]);

  // The single location a panel/form acts on: the drilled child, or the whole
  // group's root. Null when several parts are multi-selected (bulk actions only).
  const primarySelectedId =
    selection == null
      ? null
      : selection.childIds.length === 1
        ? selection.childIds[0]
        : selection.childIds.length === 0
          ? selection.groupId
          : null;
  const selectedLocationId = primarySelectedId;
  const selectedLocation = locations.find((l) => l.id === selectedLocationId) ?? null;

  // True when the user has drilled into / multi-selected specific children rather
  // than having the whole group active.
  const childrenSelected = (selection?.childIds.length ?? 0) > 0;

  // Every id to render highlighted: the chosen targets plus everything nested
  // under them, so a selected group lights up in full.
  const selectedIds = useMemo<string[]>(() => {
    if (!selection) return [];
    const base = selection.childIds.length
      ? selection.childIds
      : [selection.groupId];
    const set = new Set<string>(base);
    for (const id of base) for (const d of descendantIds(locations, id)) set.add(d);
    return [...set];
  }, [selection, locations]);

  // Immediate children of the selected group, for the "Select parts" checklist.
  const groupChildren = useMemo(() => {
    if (!selection) return [];
    return locations
      .filter((l) => l.parentId === selection.groupId)
      .map((l) => ({ id: l.id, name: l.name, type: l.type }));
  }, [selection, locations]);

  const locationEvents = selectedLocation
    ? events.filter((e) => e.locationId === selectedLocation.id)
    : [];
  const locationPlantings = selectedLocation
    ? plantings.filter((p) => p.locationId === selectedLocation.id)
    : [];

  // ---- Farms: zoom-to, current-farm tracking, viewport placement ----

  // Fit the map snugly to a farm's boundary.
  const zoomToFarm = useCallback((farm: LocationRecord) => {
    const map = mapRef.current;
    if (!map) return;
    const b = geometryBounds([farm.geometry]);
    if (b) map.fitBounds(b, { padding: 80, maxZoom: 19, duration: 600 });
  }, []);

  const selectFarm = useCallback(
    (id: string) => {
      const farm = farms.find((f) => f.id === id);
      if (!farm) return;
      setCurrentFarmId(id);
      try {
        localStorage.setItem(CURRENT_FARM_KEY, id);
      } catch {
        // ignore storage failures (private mode etc.)
      }
      zoomToFarm(farm);
    },
    [farms, zoomToFarm],
  );

  // On first load, zoom to the saved current farm, else the most recent one.
  useEffect(() => {
    if (!mapReady || farms.length === 0 || initialFarmZoomRef.current) return;
    initialFarmZoomRef.current = true;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(CURRENT_FARM_KEY);
    } catch {
      saved = null;
    }
    // farms are ordered newest-first (locations come back createdAt desc).
    const farm = farms.find((f) => f.id === saved) ?? farms[0];
    setCurrentFarmId(farm.id);
    zoomToFarm(farm);
  }, [mapReady, farms, zoomToFarm]);

  // The farm under the current viewport center — where new assets land.
  const viewportFarmId = useCallback((): string | null => {
    // Prefer the map's live center; fall back to the last reported center.
    const live = mapRef.current?.getCenter();
    const center: [number, number] | null = live
      ? [live.lng, live.lat]
      : mapCenter;
    if (center) {
      const f = farmAtPoint(farms, center[0], center[1]);
      if (f) return f.id;
    }
    return currentFarmId;
  }, [mapCenter, farms, currentFarmId]);

  const editing = editIds != null && editIds.length > 0;
  // A single chosen id edits a real location (persisted directly); several ids
  // transform together around a synthetic bbox that is never persisted.
  const editPrimaryLocation =
    editIds?.length === 1
      ? (locations.find((l) => l.id === editIds[0]) ?? null)
      : null;

  // Members that actually move + persist: the chosen ids plus their descendants.
  const editTargets = useMemo<LocationRecord[]>(() => {
    if (!editIds || editIds.length === 0) return [];
    const ids = new Set<string>(editIds);
    for (const id of editIds)
      for (const d of descendantIds(locations, id)) ids.add(d);
    return locations.filter((l) => ids.has(l.id));
  }, [editIds, locations]);

  // The gizmo's reference shape: the real primary, or a synthetic bbox for multi.
  const editGeometry = useMemo(() => {
    if (!editIds || editIds.length === 0) return null;
    if (editPrimaryLocation) {
      return { id: editPrimaryLocation.id, geometry: editPrimaryLocation.geometry };
    }
    const box = boundsPolygon(editTargets.map((l) => l.geometry));
    return box ? { id: "__multi__", geometry: box } : null;
  }, [editIds, editPrimaryLocation, editTargets]);

  // Followers that get the same transform: a single primary's descendants, or —
  // for a multi-selection — every member (the primary bbox is synthetic).
  const editChildren = useMemo<ChildGeometry[]>(() => {
    if (!editIds || editIds.length === 0) return [];
    const members = editPrimaryLocation
      ? editTargets.filter((l) => l.id !== editPrimaryLocation.id)
      : editTargets;
    return members.map((l) => ({ id: l.id, geometry: l.geometry }));
  }, [editIds, editPrimaryLocation, editTargets]);

  const editLabel = editPrimaryLocation
    ? editPrimaryLocation.name
    : `${editTargets.length} part${editTargets.length === 1 ? "" : "s"}`;

  const manipulating = picking || !!drawPoints || editing || dragging;

  const overlayOpen =
    !!selectedLocation ||
    !!pendingCoords ||
    showRecords ||
    showEventForm ||
    showPlantingForm ||
    showBuilder ||
    showGrazing ||
    showWorkspace ||
    showNewFarm ||
    showChat ||
    tagMode ||
    !!scannedTagCode ||
    !!editingLocation ||
    !!editingPlanting ||
    !!editingEvent ||
    manipulating;

  const clearSelection = useCallback(() => {
    setSelection(null);
    setPartsMode(false);
  }, []);

  const closeAllSheets = useCallback(() => {
    setSelection(null);
    setPartsMode(false);
    setPendingCoords(null);
    setShowRecords(false);
    setShowEventForm(false);
    setShowPlantingForm(false);
    setShowBuilder(false);
    setShowGrazing(false);
    setShowWorkspace(false);
    setShowNewFarm(false);
    setEditingLocation(null);
    setEditingPlanting(null);
    setEditingEvent(null);
    setDropMode(false);
  }, []);

  // Select a location from outside the map (Records list, farm switcher). Farms
  // become their own subject; anything else resolves to its top-level group.
  const selectLocationById = useCallback(
    (id: string) => {
      const loc = locations.find((l) => l.id === id);
      if (!loc) return;
      if (loc.type === "farm") {
        setSelection({ groupId: id, childIds: [] });
      } else {
        const group = groupRootId(locations, id) ?? id;
        setSelection({ groupId: group, childIds: group === id ? [] : [id] });
      }
      setPartsMode(false);
    },
    [locations],
  );

  // A tap on the map. clickedId is the deepest feature under the finger, or null
  // for empty space. First tap on a group selects the whole group; tapping again
  // drills into the specific child; in "Select parts" mode each tap toggles a
  // child in/out of the multi-selection.
  const handleMapSelect = useCallback(
    (clickedId: string | null) => {
      if (!clickedId) {
        clearSelection();
        return;
      }
      const group = groupRootId(locations, clickedId);
      if (!group) {
        // A farm (or unmappable) — farms are adjusted via the farm switcher.
        clearSelection();
        return;
      }
      setSelection((prev) => {
        const sameGroup = prev?.groupId === group;
        if (partsMode) {
          if (!sameGroup) {
            return { groupId: group, childIds: clickedId !== group ? [clickedId] : [] };
          }
          if (clickedId === group) return prev;
          const has = prev!.childIds.includes(clickedId);
          return {
            groupId: group,
            childIds: has
              ? prev!.childIds.filter((x) => x !== clickedId)
              : [...prev!.childIds, clickedId],
          };
        }
        if (!sameGroup) return { groupId: group, childIds: [] };
        // Same group, tap again → drill into the specific child tapped.
        return { groupId: group, childIds: clickedId !== group ? [clickedId] : [] };
      });
    },
    [locations, partsMode, clearSelection],
  );

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
    setEditIds(null);
    setDrawKind("paddock");
    setFarmDraftName(null);
    setDrawPoints([]);
  }, [closeAllSheets]);

  // Enter move/resize for a set of locations. One id = edit it directly; several
  // = transform them together. closeAllSheets clears the selection, so capture
  // the seed geometry first.
  const startEditTargets = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const seed =
        ids.length === 1
          ? (locations.find((l) => l.id === ids[0])?.geometry ?? null)
          : null;
      closeAllSheets();
      setDrawPoints(null);
      setEditIds(ids);
      setEditDraft(seed);
      setEditChildDrafts([]);
    },
    [closeAllSheets, locations],
  );

  const startEditGeometry = useCallback(
    (location: LocationRecord) => startEditTargets([location.id]),
    [startEditTargets],
  );

  const interaction = useMemo<MapInteraction>(
    () => ({
      picking,
      requestPick,
      beginDrag,
      startEditGeometry,
      startEditTargets,
      startDrawPaddock,
    }),
    [picking, requestPick, beginDrag, startEditGeometry, startEditTargets, startDrawPaddock],
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
          if (!res.ok) throw new Error("move rejected");
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
        // Move failed (network or server rejection) — tell the user instead of
        // showing a false "Moved" toast, and refresh so the asset snaps back.
        toast.error(`Couldn't move ${asset.label} — nothing was changed.`);
        refreshData();
      }
    },
    [locations, refreshData, toast],
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

  function cancelDraw() {
    setDrawPoints(null);
    setFarmDraftName(null);
    setDrawKind("paddock");
  }

  async function finishDraw() {
    if (!drawPoints || drawPoints.length < 3) return;
    const geometry = closePolygon(drawPoints);
    if (!geometry) return;

    if (drawKind === "farm") {
      const name = farmDraftName?.trim() || `Farm ${farms.length + 1}`;
      const res = await postJson("/api/locations", { name, type: "farm", geometry });
      cancelDraw();
      if (!res.ok) {
        toast.error("Couldn't save the farm — please try again.");
        return;
      }
      const data = await res.json();
      const locId = data.location?.id as string | undefined;
      if (locId) {
        setCurrentFarmId(locId);
        try {
          localStorage.setItem(CURRENT_FARM_KEY, locId);
        } catch {
          // ignore
        }
      }
      handleDataSaved("Farm added.");
      return;
    }

    const count = locations.filter((l) => l.type === "paddock").length + 1;
    const res = await postJson("/api/locations", {
      name: `Paddock ${count}`,
      type: "paddock",
      geometry,
      // Place it in the farm currently in view.
      parentId: viewportFarmId() ?? undefined,
    });
    cancelDraw();
    if (!res.ok) {
      toast.error("Couldn't save the paddock — please try again.");
      return;
    }
    const data = await res.json();
    const locId = data.location?.id;
    if (locId) {
      await postJson("/api/grazing/paddocks", {
        locationId: locId,
        restTargetDays: 30,
      });
    }
    handleDataSaved("Paddock added.");
  }

  async function saveGeometry() {
    if (!editing) return;
    try {
      if (editPrimaryLocation && editDraft) {
        // Single real target: persist its new geometry + any descendants.
        await patchJson(`/api/locations/${editPrimaryLocation.id}`, {
          geometry: editDraft,
        });
        if (editChildDrafts.length > 0) {
          await patchJson(`/api/locations/geometry`, { updates: editChildDrafts });
        }
      } else if (editChildDrafts.length > 0) {
        // Multi-select: the gizmo primary is synthetic — persist every member.
        await patchJson(`/api/locations/geometry`, { updates: editChildDrafts });
      }
    } catch {
      // Keep the edit open so the user can retry rather than losing their reshape.
      toast.error("Couldn't save the shape — check your connection and try again.");
      return;
    }
    setEditIds(null);
    setEditDraft(null);
    setEditChildDrafts([]);
    handleDataSaved("Shape updated.");
  }

  // Delete the current selection: the whole group (cascades to children), the
  // drilled child, or every multi-selected part. Server guards data-loss for
  // herds/paddocks with history; here we confirm before a group cascade.
  async function deleteSelection() {
    if (!selection) return;
    const ids = selection.childIds.length
      ? selection.childIds
      : [selection.groupId];
    try {
      for (const id of ids) {
        const res = await fetch(`/api/locations/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
      }
    } catch {
      toast.error("Couldn't delete — please try again.");
      refreshData();
      return;
    }
    clearSelection();
    handleDataSaved(
      ids.length === 1 ? "Deleted." : `Deleted ${ids.length} parts.`,
    );
  }

  // Duplicate one or more locations (each with everything nested inside it). The
  // copies are offset beside the originals and re-linked via the batch endpoint
  // so a whole field-of-beds clones in one shot with its hierarchy intact.
  async function duplicateRoots(rootIds: string[]) {
    if (rootIds.length === 0) return;
    const rootSet = new Set(rootIds);
    const targetIds = new Set(rootIds);
    for (const id of rootIds)
      for (const d of descendantIds(locations, id)) targetIds.add(d);
    const targets = locations.filter((l) => targetIds.has(l.id));
    if (targets.length === 0) return;

    // Offset the copies one bounding-box width to the east so they sit beside
    // the originals instead of on top of them.
    const bounds = geometryBounds(targets.map((l) => l.geometry));
    const dLng = bounds
      ? Math.max((bounds[1][0] - bounds[0][0]) * 1.08, 0.0003)
      : 0.0003;

    const nodes = targets.map((l) => {
      const isRoot = rootSet.has(l.id);
      return {
        tempId: l.id,
        // Root copies re-attach to the original's existing parent; descendants
        // link to their parent's new copy within this batch.
        parentId: isRoot ? (l.parentId ?? null) : null,
        parentTempId: isRoot ? null : l.parentId,
        name: isRoot ? `${l.name} copy` : l.name,
        type: l.type,
        geometry: translateGeometry(l.geometry, dLng, 0),
        zone: l.zone ?? undefined,
      };
    });

    try {
      const res = await postJson("/api/locations/batch", { nodes });
      if (!res.ok) throw new Error("duplicate failed");
      const data = await res.json();
      const newRoot = (data.locations as LocationRecord[] | undefined)?.find(
        (l) => l.name.endsWith(" copy"),
      );
      clearSelection();
      await refreshData();
      setCoachRefreshKey((k) => k + 1);
      if (newRoot) selectLocationById(newRoot.id);
      setCoachToast(
        rootIds.length === 1 ? "Duplicated." : `Duplicated ${rootIds.length} parts.`,
      );
    } catch {
      toast.error("Couldn't duplicate — please try again.");
    }
  }

  // Duplicate the current selection (group root, drilled child, or each part).
  function duplicateSelection() {
    if (!selection) return;
    const ids = selection.childIds.length
      ? selection.childIds
      : [selection.groupId];
    duplicateRoots(ids);
  }

  // Toggle a child in/out of the multi-selection from the parts list.
  function togglePart(id: string) {
    setSelection((prev) => {
      if (!prev) return prev;
      const has = prev.childIds.includes(id);
      return {
        groupId: prev.groupId,
        childIds: has
          ? prev.childIds.filter((x) => x !== id)
          : [...prev.childIds, id],
      };
    });
  }

  // ---- New farm flow ----

  const openNewFarm = useCallback(() => {
    closeAllSheets();
    setLogCollapsed(true);
    setShowNewFarm(true);
  }, [closeAllSheets]);

  function startFarmDraw(name: string) {
    setShowNewFarm(false);
    setEditIds(null);
    setDrawKind("farm");
    setFarmDraftName(name);
    setDrawPoints([]);
  }

  // Pan/zoom the map to an address the user picked in the New Farm sheet. Frame
  // the bounding box when we have one (a town, a parcel), else fly to the point.
  function locateAddress(target: GeocodeResult) {
    const map = mapRef.current;
    if (!map) return;
    if (target.bbox) {
      map.fitBounds(
        [
          [target.bbox[0], target.bbox[1]],
          [target.bbox[2], target.bbox[3]],
        ],
        { padding: 60, maxZoom: 18, duration: 800 },
      );
    } else {
      map.flyTo({ center: [target.lng, target.lat], zoom: 16, duration: 800 });
    }
  }

  // ---- Move an asset (and its children) into another farm ----

  async function moveAssetToFarm(location: LocationRecord, targetFarmId: string) {
    const target = farms.find((f) => f.id === targetFarmId);
    if (!target) return;
    const from: [number, number] = geometryCenter(location.geometry);
    const to: [number, number] = geometryCenter(target.geometry);
    const dLng = to[0] - from[0];
    const dLat = to[1] - from[1];

    const ids = descendantIds(locations, location.id);
    const childUpdates: ChildGeometry[] = locations
      .filter((l) => ids.has(l.id))
      .map((l) => ({ id: l.id, geometry: translateGeometry(l.geometry, dLng, dLat) }));

    try {
      await patchJson(`/api/locations/${location.id}`, {
        geometry: translateGeometry(location.geometry, dLng, dLat),
        parentId: targetFarmId,
      });
      if (childUpdates.length > 0) {
        await patchJson(`/api/locations/geometry`, { updates: childUpdates });
      }
    } catch {
      toast.error(`Couldn't move ${location.name} — nothing was changed.`);
      refreshData();
      return;
    }

    clearSelection();
    selectFarm(targetFarmId);
    handleDataSaved(`Moved ${location.name} → ${target.name}.`);
  }

  function handleLocationDeleted() {
    clearSelection();
    refreshData();
    setCoachRefreshKey((k) => k + 1);
  }

  function handleDataSaved(coachMessage?: string) {
    refreshData();
    setCoachRefreshKey((k) => k + 1);
    if (coachMessage) toast.success(coachMessage);
  }

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      // Logging out should never strand the user; note it and continue.
      toast.error("Couldn't sign out cleanly", { description: getErrorMessage(err) });
    }
    window.location.href = "/login";
  }

  return (
    <MapInteractionContext.Provider value={interaction}>
      <div className="flex h-[100dvh] flex-col overflow-hidden">
        <MobileHeader
          userName={userName}
          dropMode={dropMode}
          tagMode={tagMode}
          onToggleDropMode={() => {
            setDropMode((v) => !v);
            setPendingCoords(null);
            setLogCollapsed(true);
          }}
          onToggleTagMode={() => {
            setTagMode((v) => !v);
            // Tag mode owns the whole screen; nothing else should be competing
            // for a gloved thumb while the reader is armed.
            setDropMode(false);
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
          onOpenWorkspace={() => {
            closeAllSheets();
            setShowWorkspace(true);
          }}
          onHelp={() => tourRef.current?.start()}
          onLogout={handleLogout}
        />

        <div className="relative min-h-0 flex-1">
          <PlotMap
            locations={locations}
            selectedLocationId={selectedLocationId}
            selectedIds={selectedIds}
            onSelectLocation={(id) => {
              handleMapSelect(id);
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
              setMapReady(true);
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
            editGeometry={editGeometry}
            editChildren={editChildren}
            onGeometryChange={(g, children) => {
              setEditDraft(g);
              setEditChildDrafts(children);
            }}
            onCapturePhoto={() => setShowCapture(true)}
            onAskExpert={() => setShowChat(true)}
            fabActionsHidden={overlayOpen || manipulating}
          />

          <FarmBar
            farms={farms}
            currentFarmId={currentFarmId}
            onSelectFarm={selectFarm}
            onNewFarm={openNewFarm}
            onEditFarm={(id) => {
              // Make the farm current + zoom, then open its panel so the user
              // can rename or Move/resize the boundary directly.
              selectFarm(id);
              selectLocationById(id);
            }}
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

          {loaded &&
            locations.length === 0 &&
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

          {/* Draw paddock / farm toolbar */}
          {drawPoints && (
            <div className="absolute inset-x-3 bottom-4 z-30 rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-800">
                  {drawKind === "farm"
                    ? `Outline ${farmDraftName ?? "your farm"}`
                    : "Draw a paddock"}
                </p>
                <p className="text-sm text-emerald-700">
                  {drawPoints.length} pts · {drawArea.toFixed(2)} ac
                </p>
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Tap the map to add corners. Need at least 3.
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={cancelDraw}>
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
          {editing && (
            <div className="absolute inset-x-3 bottom-4 z-30 rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-800">
                  Reshape {editLabel}
                </p>
                {editDraft?.type === "Polygon" && editPrimaryLocation && (
                  <p className="text-sm text-emerald-700">{editArea.toFixed(2)} ac</p>
                )}
              </div>
              <p className="mt-1 text-xs text-stone-500">
                {editPrimaryLocation
                  ? editDraft?.type === "Polygon"
                    ? "Drag the handles to resize, or drag the middle to move it."
                    : "Drag the handle to reposition it."
                  : "Drag to move all parts, or use the corner/rotate handles to resize them together."}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setEditIds(null);
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
            <ChatDock
              locations={locations}
              selectedLocationId={selectedLocationId}
              onSend={(text) => {
                setChatSeed(text);
                setLogCollapsed(true);
                setShowChat(true);
              }}
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
          defaultParentId={viewportFarmId()}
          onCancel={() => setPendingCoords(null)}
          onCreated={() =>
            handleDataSaved("Location saved. Drop more pins or start logging.")
          }
        />

        {showNewFarm && (
          <NewFarmSheet
            onStartDraw={startFarmDraw}
            onLocate={locateAddress}
            onClose={() => setShowNewFarm(false)}
          />
        )}

        <TakePhotoSheet
          open={showCapture}
          onClose={() => setShowCapture(false)}
          locations={locations}
          selectedLocationId={selectedLocationId}
          mapCenter={mapCenter}
          onSaved={refreshData}
        />

        <ExpertChat
          open={showChat}
          onClose={() => setShowChat(false)}
          focusedFarmId={showChat ? viewportFarmId() : null}
          locations={locations}
          plantings={plantings}
          onLogged={refreshData}
          seed={chatSeed}
          onSeedConsumed={() => setChatSeed(undefined)}
        />

        {showBuilder && (
          <StructureBuilder
            anchor={mapCenter ? { lng: mapCenter[0], lat: mapCenter[1] } : null}
            parentId={viewportFarmId()}
            onCreated={(count) => {
              setShowBuilder(false);
              handleDataSaved(`Mapped ${count} locations. Tap any one to start logging.`);
            }}
            onClose={() => setShowBuilder(false)}
          />
        )}

        {showWorkspace && (
          <WorkspacePanel onClose={() => setShowWorkspace(false)} />
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

        {selectedLocation && !partsMode && (
          <LocationSidebar
            location={selectedLocation}
            plantings={locationPlantings}
            events={locationEvents}
            farms={farms}
            hidden={dragging || picking}
            partCount={descendantIds(locations, selectedLocation.id).size}
            groupName={
              selection && selection.childIds.length === 1
                ? (locations.find((l) => l.id === selection.groupId)?.name ?? null)
                : null
            }
            onBackToGroup={() =>
              setSelection((p) => (p ? { groupId: p.groupId, childIds: [] } : p))
            }
            onSelectParts={() => setPartsMode(true)}
            onDuplicate={duplicateSelection}
            onDelete={deleteSelection}
            onEditLocation={() => setEditingLocation(selectedLocation)}
            onAddPlanting={() => setShowPlantingForm(true)}
            onEditPlanting={setEditingPlanting}
            onEditEvent={setEditingEvent}
            onMoveToFarm={(farmId) => moveAssetToFarm(selectedLocation, farmId)}
            onClose={clearSelection}
          />
        )}

        {/* Multi-select / "Select parts" action bar */}
        {(partsMode || (childrenSelected && (selection?.childIds.length ?? 0) > 1)) &&
          !editing &&
          !picking &&
          !dragging && (
            <SelectionBar
              count={selection?.childIds.length ?? 0}
              partsMode={partsMode}
              parts={groupChildren}
              selectedPartIds={selection?.childIds ?? []}
              onTogglePart={togglePart}
              onMoveResize={() => {
                if (selection?.childIds.length) startEditTargets(selection.childIds);
              }}
              onDuplicate={duplicateSelection}
              onDelete={deleteSelection}
              onDone={() => {
                if (partsMode) setPartsMode(false);
                else clearSelection();
              }}
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
              selectLocationById(location.id);
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

        {/* Field-encode. New tubes nest under the current farm, so a run walked
            inside a block lands in that block's roll-up without anyone choosing
            a parent per tag. */}
        {tagMode && (
          <TagMode
            onClose={() => setTagMode(false)}
            parentId={currentFarmId}
            parentName={
              locations.find((l) => l.id === currentFarmId)?.name ?? null
            }
            onTagWritten={() => {
              void refreshData();
            }}
            onKnownTagScanned={(code) => {
              // Already written and locked — this is a visit. Leave tag mode so
              // the reader isn't fighting the landing screen for the radio.
              setTagMode(false);
              setScannedTagCode(code);
            }}
          />
        )}

        {scannedTagCode && (
          <TagScanSheet
            key={scannedTagCode}
            tagCode={scannedTagCode}
            crewName={userName}
            farmName={locations.find((l) => l.id === currentFarmId)?.name ?? null}
            position={mapCenter ? { lng: mapCenter[0], lat: mapCenter[1] } : null}
            onClose={() => setScannedTagCode(null)}
            onShowOnMap={(locationId) => selectLocationById(locationId)}
            onVisitLogged={() => {
              void refreshData();
              setCoachRefreshKey((k) => k + 1);
            }}
            onClaimNew={() => {
              setScannedTagCode(null);
              setTagMode(true);
            }}
          />
        )}

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
