"use client";

import { useState } from "react";
import GrazingRecordEditSheet from "@/components/grazing/GrazingRecordEditSheet";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";
import type {
  GrazingEventRecord,
  HerdRecord,
  LocationRecord,
} from "@/lib/types";

type GrazingRecordsProps = {
  herds: HerdRecord[];
  locations: LocationRecord[];
  grazingEvents: GrazingEventRecord[];
  onChanged: () => void;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function GrazingRecords({
  herds,
  locations,
  grazingEvents,
  onChanged,
}: GrazingRecordsProps) {
  const [editing, setEditing] = useState<GrazingEventRecord | null>(null);
  const herdById = new Map(herds.map((h) => [h.id, h]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  const rows = [...grazingEvents].sort(
    (a, b) => new Date(b.movedInAt).getTime() - new Date(a.movedInAt).getTime(),
  );

  function handlePrint() {
    const body = rows
      .map((e) => {
        const herd = herdById.get(e.herdId);
        const loc = locById.get(e.locationId);
        const cells = [
          loc?.name ?? "",
          herd ? `${herd.species} (${herd.headCount})` : "",
          e.forageSpecies ?? "",
          e.movedInAt ? new Date(e.movedInAt).toLocaleDateString("en-US") : "",
          e.movedOutAt ? new Date(e.movedOutAt).toLocaleDateString("en-US") : "",
          e.heightInIn ?? "",
          e.heightOutIn ?? "",
          e.notes ?? "",
        ];
        return `<tr>${cells.map((c) => `<td>${String(c)}</td>`).join("")}</tr>`;
      })
      .join("");
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Grazing Records</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#1c1917}
        h1{font-size:18px;margin:0 0 4px}
        p{color:#57534e;font-size:12px;margin:0 0 16px}
        table{border-collapse:collapse;width:100%;font-size:12px}
        th,td{border:1px solid #d6d3d1;padding:6px 8px;text-align:left;vertical-align:top}
        th{background:#f5f5f4}
      </style></head><body>
      <h1>Grazing Management (528) — Recordkeeping Worksheet</h1>
      <p>Document the periods of use and other activities in each field/paddock.</p>
      <table><thead><tr>
        <th>Field/Paddock ID</th><th>Livestock</th><th>Forage Species</th>
        <th>Date In</th><th>Date Out</th><th>Height In (in)</th>
        <th>Height Out (in)</th><th>Notes</th>
      </tr></thead><tbody>${body}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <a
          href="/api/grazing/export"
          className="focus-ring touch-target inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-700"
        >
          <Icon name="check" size={18} />
          Download CSV
        </a>
        <Button
          variant="secondary"
          leftIcon="list"
          className="flex-1"
          disabled={rows.length === 0}
          onClick={handlePrint}
        >
          Print worksheet
        </Button>
      </div>

      <p className="text-xs text-stone-400">
        NRCS Grazing Management (528) recordkeeping — hand this to your conservation
        planner. Tap any row to edit or delete it.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon="list"
          title="No grazing records yet"
          description="Move a herd onto a paddock (Move tab) and each grazing period lands here as an NRCS 528 row."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-400">
                <th className="py-1 pr-2 font-medium">Paddock</th>
                <th className="py-1 pr-2 font-medium">Stock</th>
                <th className="py-1 pr-2 font-medium">In</th>
                <th className="py-1 pr-2 font-medium">Out</th>
                <th className="py-1 font-medium">Ht in/out</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const herd = herdById.get(e.herdId);
                const loc = locById.get(e.locationId);
                return (
                  <tr
                    key={e.id}
                    onClick={() => setEditing(e)}
                    className="cursor-pointer border-t border-stone-100 text-stone-700 active:bg-emerald-50"
                  >
                    <td className="py-1.5 pr-2">{loc?.name ?? "—"}</td>
                    <td className="py-1.5 pr-2">
                      {herd ? `${herd.species} ${herd.headCount}` : "—"}
                    </td>
                    <td className="py-1.5 pr-2">{fmt(e.movedInAt)}</td>
                    <td className="py-1.5 pr-2">
                      {e.movedOutAt ? (
                        fmt(e.movedOutAt)
                      ) : (
                        <span className="rounded-full bg-sky-100 px-1.5 text-[11px] font-semibold text-sky-800">
                          on
                        </span>
                      )}
                    </td>
                    <td className="py-1.5">
                      {e.heightInIn ?? "—"} / {e.heightOutIn ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <GrazingRecordEditSheet
          record={editing}
          herds={herds}
          locations={locations}
          onSaved={onChanged}
          onDeleted={onChanged}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
