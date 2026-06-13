"use client";

import { useMemo, useState } from "react";
import CrossList from "@/components/breeding/CrossList";
import SeasonManager from "@/components/breeding/SeasonManager";
import VarietyManager from "@/components/breeding/VarietyManager";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { locationTypeEmoji, locationTypeLabel } from "@/lib/locations/catalog";
import type {
  CrossRecord,
  EventRecord,
  LocationRecord,
  PlantingRecord,
  SeasonRecord,
  VarietyRecord,
} from "@/lib/types";

type Tab =
  | "locations"
  | "plantings"
  | "logs"
  | "varieties"
  | "crosses"
  | "seasons";

type RecordsPanelProps = {
  locations: LocationRecord[];
  plantings: PlantingRecord[];
  events: EventRecord[];
  varieties: VarietyRecord[];
  crosses: CrossRecord[];
  seasons: SeasonRecord[];
  onEditLocation: (location: LocationRecord) => void;
  onEditPlanting: (planting: PlantingRecord) => void;
  onEditEvent: (event: EventRecord) => void;
  onAddLocation: () => void;
  onAddPlanting: () => void;
  onAddEvent: () => void;
  onChanged: () => void;
  onClose: () => void;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "locations", label: "Places" },
  { id: "plantings", label: "Crops" },
  { id: "logs", label: "Logs" },
  { id: "varieties", label: "Varieties" },
  { id: "crosses", label: "Crosses" },
  { id: "seasons", label: "Seasons" },
];

const BASIC_TABS = new Set<Tab>(["locations", "plantings", "logs"]);

export default function RecordsPanel({
  locations,
  plantings,
  events,
  varieties,
  crosses,
  seasons,
  onEditLocation,
  onEditPlanting,
  onEditEvent,
  onAddLocation,
  onAddPlanting,
  onAddEvent,
  onChanged,
  onClose,
}: RecordsPanelProps) {
  const [tab, setTab] = useState<Tab>("locations");
  const [query, setQuery] = useState("");

  const locationNameById = useMemo(
    () => new Map(locations.map((l) => [l.id, l.name])),
    [locations],
  );

  const filteredLocations = locations.filter((l) =>
    l.name.toLowerCase().includes(query.toLowerCase()),
  );

  const filteredPlantings = plantings.filter((p) => {
    const label = `${p.commonName} ${p.variety ?? ""} ${locationNameById.get(p.locationId) ?? ""}`;
    return label.toLowerCase().includes(query.toLowerCase());
  });

  const filteredEvents = events.filter((e) => {
    const label = `${e.type} ${e.notes ?? ""} ${locationNameById.get(e.locationId ?? "") ?? ""}`;
    return label.toLowerCase().includes(query.toLowerCase());
  });

  const money = useMemo(() => {
    let sales = 0;
    let costs = 0;
    for (const e of events) {
      if (e.type === "sale" && e.amount) sales += e.amount;
      if (e.type === "cost" && e.amount) costs += e.amount;
    }
    return { sales, costs, net: sales - costs };
  }, [events]);

  function handleAdd() {
    if (tab === "locations") onAddLocation();
    if (tab === "plantings") onAddPlanting();
    if (tab === "logs") onAddEvent();
  }

  return (
    <BottomSheet open onClose={onClose} title="Records" fullScreen>
      <div className="pb-2">
        <SegmentedControl
          options={tabs}
          value={tab}
          onChange={setTab}
          ariaLabel="Record types"
        />
      </div>

      {BASIC_TABS.has(tab) && (
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="flex-1"
          />
          <Button leftIcon="plus" onClick={handleAdd} className="shrink-0">
            Add
          </Button>
        </div>
      )}

      <div className="mt-4 pb-4">
        {tab === "locations" && (
          <ul className="space-y-2">
            {filteredLocations.length === 0 ? (
              <EmptyState
                icon="mapPin"
                title="No places yet"
                description="Map your farm with Build, or drop a pin to add your first spot."
                actionLabel="Add a location"
                actionIcon="plus"
                onAction={onAddLocation}
              />
            ) : (
              filteredLocations.map((location) => (
                <li key={location.id}>
                  <button
                    type="button"
                    onClick={() => onEditLocation(location)}
                    className="w-full rounded-xl border border-stone-100 px-4 py-4 text-left active:bg-emerald-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-stone-900">{location.name}</span>
                      <span className="text-xs text-stone-400">
                        {locationTypeEmoji(location.type)} {locationTypeLabel(location.type)}
                      </span>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {tab === "plantings" && (
          <ul className="space-y-2">
            {filteredPlantings.length === 0 ? (
              <EmptyState
                icon="leaf"
                title="No plantings yet"
                description="Track a crop, flower, tree, or breeding line and link your logs to it."
                actionLabel="Add a planting"
                actionIcon="plus"
                onAction={onAddPlanting}
              />
            ) : (
              filteredPlantings.map((planting) => (
                <li key={planting.id}>
                  <button
                    type="button"
                    onClick={() => onEditPlanting(planting)}
                    className="w-full rounded-xl border border-stone-100 px-4 py-4 text-left active:bg-emerald-50"
                  >
                    <div className="font-medium text-stone-900">
                      {planting.commonName}
                      {planting.variety ? ` · ${planting.variety}` : ""}
                    </div>
                    <p className="mt-0.5 text-sm text-stone-500">
                      {locationNameById.get(planting.locationId) ?? "Unknown"} ·{" "}
                      {planting.status}
                      {planting.source ? ` · ${planting.source}` : ""}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {tab === "logs" && (
          <>
            {(money.sales > 0 || money.costs > 0) && (
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-stone-100 bg-white px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">Sales</p>
                  <p className="text-base font-semibold text-emerald-700">
                    ${money.sales.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-100 bg-white px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">Costs</p>
                  <p className="text-base font-semibold text-stone-700">
                    ${money.costs.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-100 bg-white px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">Net</p>
                  <p
                    className={`text-base font-semibold ${
                      money.net >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    ${money.net.toFixed(2)}
                  </p>
                </div>
              </div>
            )}
            <ul className="space-y-2">
              {filteredEvents.length === 0 ? (
                <EmptyState
                  icon="sparkle"
                  title="Nothing logged yet"
                  description="Close Records and use the bar at the bottom — type what happened in plain English."
                />
              ) : (
                filteredEvents.map((event) => {
                  const qty =
                    event.quantity != null
                      ? `${event.quantity}${event.unit ? ` ${event.unit}` : ""}`
                      : null;
                  const amt = event.amount != null ? `$${event.amount.toFixed(2)}` : null;
                  const metric = [qty, amt].filter(Boolean).join(" · ");
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => onEditEvent(event)}
                        className="w-full rounded-xl border border-stone-100 px-4 py-4 text-left active:bg-emerald-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium capitalize text-emerald-800">
                            {event.type.replace("_", " ")}
                            {event.locationId &&
                              ` · ${locationNameById.get(event.locationId) ?? ""}`}
                          </span>
                          <span className="text-sm text-stone-400">
                            {new Date(event.occurredAt).toLocaleDateString()}
                          </span>
                        </div>
                        {metric && (
                          <p className="mt-0.5 text-sm font-medium text-stone-700">{metric}</p>
                        )}
                        {event.notes && (
                          <p className="mt-1 text-sm text-stone-600 line-clamp-2">
                            {event.notes}
                          </p>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        )}

        {tab === "varieties" && (
          <VarietyManager varieties={varieties} onChanged={onChanged} />
        )}
        {tab === "crosses" && (
          <CrossList crosses={crosses} plantings={plantings} />
        )}
        {tab === "seasons" && (
          <SeasonManager seasons={seasons} onChanged={onChanged} />
        )}
      </div>
    </BottomSheet>
  );
}
