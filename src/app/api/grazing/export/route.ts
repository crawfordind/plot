import { eq } from "drizzle-orm";
import { db } from "@/db";
import { grazingEvents, herds, locations } from "@/db/schema";
import { requireUser } from "@/lib/api";

// NRCS Grazing Management (528) Recordkeeping Worksheet columns.
const HEADERS = [
  "Field/Paddock ID",
  "Livestock Type",
  "Livestock No.",
  "Predominant Forage Species",
  "Date Grazed In",
  "Date Grazed Out",
  "Grazing Height In (in)",
  "Grazing Height Out (in)",
  "Notes",
];

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US");
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response!;

  const [eventRows, herdRows, locationRows] = await Promise.all([
    db.query.grazingEvents.findMany({
      where: eq(grazingEvents.userId, user.id),
      orderBy: (table, { asc }) => [asc(table.movedInAt)],
    }),
    db.query.herds.findMany({ where: eq(herds.userId, user.id) }),
    db.query.locations.findMany({ where: eq(locations.userId, user.id) }),
  ]);

  const herdById = new Map(herdRows.map((h) => [h.id, h]));
  const locById = new Map(locationRows.map((l) => [l.id, l]));

  const lines = [HEADERS.map(csvCell).join(",")];
  for (const e of eventRows) {
    const herd = herdById.get(e.herdId);
    const loc = locById.get(e.locationId);
    lines.push(
      [
        csvCell(loc?.name ?? ""),
        csvCell(herd ? herd.species : ""),
        csvCell(herd ? herd.headCount : ""),
        csvCell(e.forageSpecies ?? ""),
        csvCell(fmtDate(e.movedInAt ? e.movedInAt.toISOString() : null)),
        csvCell(fmtDate(e.movedOutAt ? e.movedOutAt.toISOString() : null)),
        csvCell(e.heightInIn ?? ""),
        csvCell(e.heightOutIn ?? ""),
        csvCell(e.notes ?? ""),
      ].join(","),
    );
  }

  const csv = lines.join("\r\n");
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grazing-records-${today}.csv"`,
    },
  });
}
