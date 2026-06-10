"use client";

import BottomSheet from "@/components/ui/BottomSheet";
import type { EventRecord, LocationRecord, PlantingRecord } from "@/lib/types";

type LocationSidebarProps = {
  location: LocationRecord;
  plantings: PlantingRecord[];
  events: EventRecord[];
  onEditLocation: () => void;
  onAddPlanting: () => void;
  onEditPlanting: (planting: PlantingRecord) => void;
  onEditEvent: (event: EventRecord) => void;
  onClose: () => void;
};

export default function LocationSidebar({
  location,
  plantings,
  events,
  onEditLocation,
  onAddPlanting,
  onEditPlanting,
  onEditEvent,
  onClose,
}: LocationSidebarProps) {
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={location.name}
      subtitle={`${location.type}${location.zone ? ` · Zone ${location.zone}` : ""}`}
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onEditLocation}
          className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50"
        >
          Edit location
        </button>
        <button
          type="button"
          onClick={onAddPlanting}
          className="touch-target flex-1 rounded-xl bg-emerald-600 text-sm font-semibold text-white active:bg-emerald-700"
        >
          + Planting
        </button>
      </div>

      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Plantings ({plantings.length})
        </h3>
        <ul className="mt-2 space-y-1">
          {plantings.length === 0 ? (
            <li className="py-2 text-sm text-stone-400">None yet — add one above</li>
          ) : (
            plantings.map((planting) => (
              <li key={planting.id}>
                <button
                  type="button"
                  onClick={() => onEditPlanting(planting)}
                  className="touch-target w-full rounded-xl px-3 py-3 text-left text-sm text-stone-800 active:bg-stone-50"
                >
                  <span className="font-medium">{planting.commonName}</span>
                  {planting.variety && (
                    <span className="text-stone-500"> · {planting.variety}</span>
                  )}
                  <span className="ml-2 text-xs text-stone-400">{planting.status}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-5 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Logs ({events.length})
        </h3>
        <ul className="mt-2 space-y-2">
          {events.length === 0 ? (
            <li className="py-2 text-sm text-stone-400">No logs yet — use the bar below</li>
          ) : (
            events.slice(0, 15).map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onEditEvent(event)}
                  className="w-full rounded-xl bg-stone-50 px-3 py-3 text-left active:bg-emerald-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium capitalize text-emerald-800">
                      {event.type.replace("_", " ")}
                    </span>
                    <span className="shrink-0 text-xs text-stone-400">
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
      </section>
    </BottomSheet>
  );
}
