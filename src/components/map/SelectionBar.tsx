"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { locationTypeLabel } from "@/lib/locations/catalog";

type Part = { id: string; name: string; type: string };

type SelectionBarProps = {
  // How many child parts are currently selected.
  count: number;
  // Whether the user is still tapping to add parts.
  partsMode: boolean;
  // The parent's immediate children, to pick from as a list.
  parts: Part[];
  selectedPartIds: string[];
  onTogglePart: (id: string) => void;
  onMoveResize: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDone: () => void;
};

// Bottom action bar for multi-selecting and acting on several components at once.
// Lists the parent's children so they can be picked from a list as well as by
// tapping the map; selected rows are highlighted.
export default function SelectionBar({
  count,
  partsMode,
  parts,
  selectedPartIds,
  onTogglePart,
  onMoveResize,
  onDuplicate,
  onDelete,
  onDone,
}: SelectionBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasSelection = count > 0;
  const selected = new Set(selectedPartIds);

  return (
    <div className="absolute inset-x-3 bottom-4 z-30 rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-stone-800">
          {count} part{count === 1 ? "" : "s"} selected
        </p>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-2 py-1 text-sm font-medium text-stone-500 active:text-stone-700"
        >
          {partsMode ? "Done" : "Clear"}
        </button>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        Tap a component below or on the map to select it.
      </p>

      {parts.length > 0 && (
        <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto">
          {parts.map((part) => {
            const isOn = selected.has(part.id);
            return (
              <li key={part.id}>
                <button
                  type="button"
                  onClick={() => onTogglePart(part.id)}
                  aria-pressed={isOn}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm active:scale-[0.99] ${
                    isOn
                      ? "border-emerald-300 bg-emerald-50 font-medium text-emerald-900"
                      : "border-stone-200 bg-white text-stone-700"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      isOn
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-stone-300 bg-white"
                    }`}
                  >
                    {isOn && <Icon name="check" size={13} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{part.name}</span>
                  <span className="shrink-0 text-xs text-stone-400">
                    {locationTypeLabel(part.type)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!hasSelection}
          onClick={onMoveResize}
          className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50 disabled:opacity-40"
        >
          Move / resize
        </button>
        <button
          type="button"
          disabled={!hasSelection}
          onClick={onDuplicate}
          className="touch-target flex-1 rounded-xl border border-stone-200 text-sm font-medium text-stone-700 active:bg-stone-50 disabled:opacity-40"
        >
          Duplicate
        </button>
        {confirmDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="touch-target flex-1 rounded-xl bg-red-600 text-sm font-semibold text-white active:bg-red-700"
          >
            Delete {count}?
          </button>
        ) : (
          <button
            type="button"
            disabled={!hasSelection}
            onClick={() => setConfirmDelete(true)}
            className="touch-target flex-1 rounded-xl border border-red-200 text-sm font-medium text-red-600 active:bg-red-50 disabled:opacity-40"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
