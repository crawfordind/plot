"use client";

import { useEffect, useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { apiFetch } from "@/lib/client";
import type { GeocodeResult } from "@/lib/geocode";

type NewFarmSheetProps = {
  // Proceed to drawing the boundary on the map with this farm name.
  onStartDraw: (name: string) => void;
  // Pan/zoom the map to a picked address so the user draws in the right place.
  onLocate: (target: GeocodeResult) => void;
  onClose: () => void;
};

export default function NewFarmSheet({ onStartDraw, onLocate, onClose }: NewFarmSheetProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Suppress the next search after a pick (selecting fills the input, which
  // would otherwise re-trigger the debounced lookup).
  const skipNextRef = useRef(false);

  // Debounced address search. Aborts the in-flight request when the query
  // changes so stale results can't overwrite newer ones.
  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    const q = address.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await apiFetch<{ results: GeocodeResult[] }>(
          `/api/geocode?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        setResults(data.results ?? []);
        setActiveIndex(-1);
      } catch {
        // Aborted or network error — leave prior results untouched.
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [address]);

  function pick(result: GeocodeResult) {
    skipNextRef.current = true;
    setAddress(result.label);
    setResults([]);
    setActiveIndex(-1);
    onLocate(result);
  }

  function handleAddressKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      pick(results[activeIndex]);
    } else if (e.key === "Escape") {
      setResults([]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onStartDraw(name.trim());
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="New farm"
      subtitle="Name it, find its location, then trace its boundary."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Farm name">
          <Input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Home farm, North parcel…"
          />
        </Field>

        <Field
          label="Address or place"
          hint="Optional — jump the map to your farm before drawing."
        >
          <div className="relative">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={handleAddressKeyDown}
              placeholder="123 Farm Rd, town, state…"
              autoComplete="off"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-autocomplete="list"
            />
            {loading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="block h-4 w-4 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" />
              </span>
            )}
            {results.length > 0 && (
              <ul
                role="listbox"
                className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
              >
                {results.map((r, i) => (
                  <li key={r.id} role="option" aria-selected={i === activeIndex}>
                    <button
                      type="button"
                      onClick={() => pick(r)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${
                        i === activeIndex ? "bg-stone-100" : ""
                      }`}
                    >
                      <Icon
                        name="mapPin"
                        className="mt-0.5 h-4 w-4 shrink-0 text-stone-400"
                      />
                      <span className="text-stone-700">{r.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        <p className="text-xs text-stone-500">
          Next you&apos;ll tap the map to outline the farm. Everything you place
          while viewing this farm will belong to it.
        </p>
        <div className="flex gap-2 pb-safe">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-[1.6]"
            leftIcon="penDraw"
            disabled={!name.trim()}
          >
            Draw boundary
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
