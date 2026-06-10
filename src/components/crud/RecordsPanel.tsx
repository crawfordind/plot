"use client";

import { useMemo, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import type { EventRecord, LocationRecord, PlantingRecord } from "@/lib/types";

type Tab = "locations" | "plantings" | "logs";

type RecordsPanelProps = {
  locations: LocationRecord[];
  plantings: PlantingRecord[];
  events: EventRecord[];
  onEditLocation: (location: LocationRecord) => void;
  onEditPlanting: (planting: PlantingRecord) => void;
  onEditEvent: (event: EventRecord) => void;
  onAddLocation: () => void;
  onAddPlanting: () => void;
  onAddEvent: () => void;
  onClose: () => void;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "locations", label: "Places" },
  { id: "plantings", label: "Crops" },
  { id: "logs", label: "Logs" },
];

export default function RecordsPanel({
  locations,
  plantings,
  events,
  onEditLocation,
  onEditPlanting,
  onEditEvent,
  onAddLocation,
  onAddPlanting,
  onAddEvent,
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

  function handleAdd() {
    if (tab === "locations") onAddLocation();
    if (tab === "plantings") onAddPlanting();
    if (tab === "logs") onAddEvent();
  }

  return (
    <BottomSheet open onClose={onClose} title="Records" fullScreen>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              tab === item.id
                ? "bg-emerald-600 text-white"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="min-h-[48px] flex-1 rounded-xl border border-stone-200 px-4 outline-none focus:border-emerald-500"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="touch-target shrink-0 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white"
        >
          + Add
        </button>
      </div>

      <div className="mt-4 pb-4">
        {tab === "locations" && (
          <ul className="space-y-2">
            {filteredLocations.length === 0 ? (
              <li className="py-4 text-sm text-stone-400">No locations yet</li>
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
                      <span className="text-xs capitalize text-stone-400">{location.type}</span>
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
              <li className="py-4 text-sm text-stone-400">No plantings yet</li>
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
                      {locationNameById.get(planting.locationId) ?? "Unknown"} · {planting.status}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {tab === "logs" && (
          <ul className="space-y-2">
            {filteredEvents.length === 0 ? (
              <li className="py-4 text-sm text-stone-400">No logs yet</li>
            ) : (
              filteredEvents.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onEditEvent(event)}
                    className="w-full rounded-xl border border-stone-100 px-4 py-4 text-left active:bg-emerald-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize text-emerald-800">
                        {event.type.replace("_", " ")}
                      </span>
                      <span className="text-sm text-stone-400">
                        {new Date(event.occurredAt).toLocaleDateString()}
                      </span>
                    </div>
                    {event.notes && (
                      <p className="mt-1 text-sm text-stone-600 line-clamp-2">{event.notes}</p>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
