"use client";

import { useState } from "react";
import AttachmentsSection from "@/components/locations/AttachmentsSection";
import { useMapInteraction } from "@/components/map/MapInteractionContext";
import BottomSheet from "@/components/ui/BottomSheet";
import Icon from "@/components/ui/Icon";
import { locationTypeEmoji, locationTypeLabel } from "@/lib/locations/catalog";
import type { EventRecord, LocationRecord, PlantingRecord } from "@/lib/types";

type LocationSidebarProps = {
  location: LocationRecord;
  plantings: PlantingRecord[];
  events: EventRecord[];
  // All farms, for the "move to another farm" action.
  farms: LocationRecord[];
  hidden?: boolean;
  // How many components are nested under this one (drives the group copy).
  partCount: number;
  // Set when this is a child drilled out of a group — offers a way back.
  groupName: string | null;
  onBackToGroup: () => void;
  // Enter "Select parts" mode to multi-select children.
  onSelectParts: () => void;
  // Duplicate this location (and everything inside it) beside the original.
  onDuplicate: () => void;
  // Delete this location (and, for a group, everything inside it).
  onDelete: () => void;
  onEditLocation: () => void;
  onAddPlanting: () => void;
  onEditPlanting: (planting: PlantingRecord) => void;
  onEditEvent: (event: EventRecord) => void;
  // Reassign this asset (and its children) to another farm.
  onMoveToFarm: (farmId: string) => void;
  onClose: () => void;
};

// A small drag handle; pressing it lifts the asset for drag-to-move.
function Grip({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span
      onPointerDown={onPointerDown}
      role="button"
      aria-label="Drag to move"
      className="flex shrink-0 cursor-grab touch-none select-none items-center px-1 text-stone-400 active:cursor-grabbing active:text-emerald-600"
    >
      ⠿
    </span>
  );
}

export default function LocationSidebar({
  location,
  plantings,
  events,
  farms,
  hidden,
  partCount,
  groupName,
  onBackToGroup,
  onSelectParts,
  onDuplicate,
  onDelete,
  onEditLocation,
  onAddPlanting,
  onEditPlanting,
  onEditEvent,
  onMoveToFarm,
  onClose,
}: LocationSidebarProps) {
  const { beginDrag, startEditGeometry } = useMapInteraction();
  const [showMore, setShowMore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Farms this asset could be moved into (any farm other than itself).
  const otherFarms = farms.filter((f) => f.id !== location.id);
  const canMoveToFarm = location.type !== "farm" && otherFarms.length > 0;
  // A group is a location with components nested inside it. When one is selected
  // as a whole, move/resize/delete act on the group + everything in it.
  const isGroup = partCount > 0;

  return (
    <BottomSheet
      open
      onClose={onClose}
      hidden={hidden}
      title={location.name}
      subtitle={`${locationTypeEmoji(location.type)} ${locationTypeLabel(location.type)}${
        location.zone ? ` · Zone ${location.zone}` : ""
      }`}
    >
      {groupName && (
        <button
          type="button"
          onClick={onBackToGroup}
          className="mb-2 text-xs font-medium text-emerald-700 active:text-emerald-900"
        >
          ‹ Back to {groupName}
        </button>
      )}

      {isGroup && (
        <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Selected as a group — move, resize or delete affects this and the{" "}
          {partCount} component{partCount === 1 ? "" : "s"} inside it.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onEditLocation}
          className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => startEditGeometry(location)}
          className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50"
        >
          Move / resize
        </button>
        <button
          type="button"
          onClick={onAddPlanting}
          className="touch-target flex-1 rounded-xl bg-emerald-600 text-sm font-semibold text-white active:bg-emerald-700"
        >
          + Planting
        </button>
      </div>

      <div className="mt-2 flex gap-2">
        {isGroup && (
          <button
            type="button"
            onClick={onSelectParts}
            className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50"
          >
            Select parts
          </button>
        )}
        <button
          type="button"
          onClick={onDuplicate}
          className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50"
        >
          Duplicate
        </button>
        {confirmDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="touch-target flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white active:bg-red-700"
          >
            {isGroup ? `Delete all ${partCount + 1}?` : "Delete?"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="touch-target flex-1 rounded-xl border border-red-200 text-sm font-medium text-red-600 active:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>

      {canMoveToFarm && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className="touch-target flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50"
          >
            <Icon name="menu" size={16} />
            More
            <Icon name={showMore ? "chevronDown" : "chevronRight"} size={16} />
          </button>

          {showMore && (
            <div className="mt-2 rounded-xl border border-stone-100 bg-stone-50 p-2">
              <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Move to another farm
              </p>
              <ul className="space-y-1">
                {otherFarms.map((farm) => (
                  <li key={farm.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onMoveToFarm(farm.id);
                        setShowMore(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-left text-sm text-stone-800 shadow-sm active:bg-emerald-50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                        <Icon name="map" size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{farm.name}</span>
                      <Icon name="chevronRight" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="px-1 pt-1.5 text-[11px] text-stone-400">
                Moves this {location.type} and anything inside it into the chosen farm.
              </p>
            </div>
          )}
        </div>
      )}

      <AttachmentsSection locationId={location.id} />

      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Plantings ({plantings.length})
        </h3>
        <ul className="mt-2 space-y-1">
          {plantings.length === 0 ? (
            <li className="py-2 text-sm text-stone-400">None yet — add one above</li>
          ) : (
            plantings.map((planting) => (
              <li key={planting.id} className="flex items-center gap-1">
                <Grip
                  onPointerDown={(e) =>
                    beginDrag(
                      {
                        kind: "planting",
                        id: planting.id,
                        label: planting.commonName,
                        fromLocationId: planting.locationId,
                      },
                      e,
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => onEditPlanting(planting)}
                  className="touch-target min-w-0 flex-1 rounded-xl px-2 py-3 text-left text-sm text-stone-800 active:bg-stone-50"
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
        {plantings.length > 0 && (
          <p className="mt-1 px-2 text-[11px] text-stone-400">
            Drag the ⠿ handle onto another location to move a planting.
          </p>
        )}
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
              <li key={event.id} className="flex items-center gap-1">
                <Grip
                  onPointerDown={(e) =>
                    beginDrag(
                      {
                        kind: "event",
                        id: event.id,
                        label: event.type.replace("_", " "),
                        fromLocationId: event.locationId,
                      },
                      e,
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => onEditEvent(event)}
                  className="min-w-0 flex-1 rounded-xl bg-stone-50 px-3 py-3 text-left active:bg-emerald-50"
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
