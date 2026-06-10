"use client";

import { useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import { layoutStructure, type Anchor } from "@/lib/structure/layout";
import type { StructureNode, StructureSpec } from "@/lib/structure/schema";

type StructureBuilderProps = {
  anchor: Anchor | null;
  onCreated: (count: number) => void;
  onClose: () => void;
};

const examples = [
  "Two hoop houses, two beds in each, and two rows of plants per bed",
  "A field with 4 beds, plus a fence line around the perimeter",
  "One greenhouse with 3 beds, each with 2 rows",
];

function countLeaves(node: StructureNode): number {
  const reps = node.count && node.count > 0 ? node.count : 1;
  const children = node.children ?? [];
  const childTotal = children.reduce((sum, c) => sum + countLeaves(c), 1);
  return reps * childTotal;
}

function totalParts(spec: StructureSpec): number {
  return spec.nodes.reduce((sum, n) => sum + countLeaves(n), 0);
}

function TreePreview({ nodes, depth = 0 }: { nodes: StructureNode[]; depth?: number }) {
  return (
    <ul className={depth === 0 ? "space-y-1" : "mt-1 space-y-1"}>
      {nodes.map((node, i) => {
        const reps = node.count && node.count > 0 ? node.count : 1;
        return (
          <li key={`${depth}-${i}-${node.name}`} style={{ paddingLeft: depth * 14 }}>
            <span className="inline-flex items-center gap-1.5 text-sm text-stone-800">
              <span className="text-stone-400">{depth === 0 ? "▣" : "›"}</span>
              <span className="font-medium">{node.name}</span>
              {reps > 1 && (
                <span className="rounded-full bg-emerald-100 px-1.5 text-[11px] font-semibold text-emerald-800">
                  ×{reps}
                </span>
              )}
              <span className="text-[11px] uppercase tracking-wide text-stone-400">
                {node.type}
              </span>
            </span>
            {node.children && node.children.length > 0 && (
              <TreePreview nodes={node.children} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function StructureBuilder({
  anchor,
  onCreated,
  onClose,
}: StructureBuilderProps) {
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [spec, setSpec] = useState<StructureSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || parsing) return;
    setParsing(true);
    setError(null);
    setSpec(null);

    try {
      const response = await fetch("/api/structure/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: text.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not read that");

      if (!data.spec?.nodes?.length) {
        setError(
          data.spec?.summary ??
            "I couldn't find any structures in that. Try naming the parts, like \"two beds with two rows each\".",
        );
        return;
      }
      setSpec(data.spec);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that");
    } finally {
      setParsing(false);
    }
  }

  async function handlePlace() {
    if (!spec) return;
    if (!anchor) {
      setError("Move the map to where this should go, then try again.");
      return;
    }
    setPlacing(true);
    setError(null);

    try {
      const placed = layoutStructure(spec, anchor);
      const response = await fetch("/api/locations/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes: placed.map((node) => ({
            tempId: node.tempId,
            parentTempId: node.parentTempId,
            name: node.name,
            type: node.type,
            geometry: node.geometry,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to place structure");

      onCreated(data.count ?? placed.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place structure");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Describe your farm"
      subtitle="Say what you have — I'll lay it out on the map."
    >
      {!spec ? (
        <form onSubmit={handleParse} className="space-y-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="e.g. two hoop houses, two beds in each, two rows per bed"
            className="w-full resize-none rounded-2xl border border-stone-200 px-4 py-3 outline-none focus:border-emerald-500"
          />

          <div className="flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setText(ex)}
                className="rounded-full border border-stone-200 px-3 py-1.5 text-left text-xs text-stone-600 active:bg-emerald-50"
              >
                {ex}
              </button>
            ))}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={parsing || !text.trim()}
            className="touch-target w-full rounded-2xl bg-emerald-600 py-4 text-base font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
          >
            {parsing ? "Reading…" : "Build my farm"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
            <p className="text-xs font-medium text-emerald-800">
              {spec.summary ?? "Here's what I'll add:"}
            </p>
            <div className="mt-2">
              <TreePreview nodes={spec.nodes} />
            </div>
            <p className="mt-3 text-[11px] text-stone-500">
              {totalParts(spec)} locations · placed at the center of the map. You can drag
              the map first to choose where.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pb-safe">
            <button
              type="button"
              onClick={() => {
                setSpec(null);
                setError(null);
              }}
              className="touch-target flex-1 rounded-2xl border border-stone-200 text-sm font-medium text-stone-600"
            >
              Edit description
            </button>
            <button
              type="button"
              onClick={handlePlace}
              disabled={placing}
              className="touch-target flex-[2] rounded-2xl bg-emerald-600 text-base font-semibold text-white active:bg-emerald-700 disabled:opacity-50"
            >
              {placing ? "Placing…" : "Place on map"}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
