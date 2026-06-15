// The tools the Plot agent can call. Two kinds:
//
//   - read  tools run server-side inside the agent loop; their string result is
//           fed back to the model so it can keep reasoning (e.g. look something
//           up, then answer).
//   - write tools never touch the DB here. They RESOLVE the model's arguments
//           into a proposal (the same ResolvedParse the "Log It" flow produces)
//           which the chat surfaces as a confirm card. Nothing is persisted until
//           the human taps Confirm — see ParseConfirmCard → /api/log/confirm.
//
// This is what makes the chat agentic rather than a chatbot: it can act, but
// writes stay human-in-the-loop.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  events,
  grazingEvents,
  herds,
  locations,
  paddocks,
  plantings,
} from "@/db/schema";
import { applyHerdMove, HerdMoveError } from "@/lib/grazing/move";
import { buildGrazingSnapshot } from "@/lib/grazing/status";
import { resolveParse } from "@/lib/parse/resolve";
import {
  eventTypeEnum,
  llmParseOutputSchema,
  type ResolvedParse,
} from "@/lib/parse/schema";
import {
  serializeGrazingEvent,
  serializeHerd,
  serializeLocation,
  serializePaddock,
  serializePlanting,
} from "@/lib/serializers";
import type { AgentToolDef } from "@/lib/openrouter";

export type AgentToolContext = {
  orgId: string;
  userId: string;
  focusedFarmId?: string | null;
};

// What a write tool hands back for the user to confirm — the same shape
// ParseConfirmCard already consumes.
export type LogProposal = { rawText: string; resolved: ResolvedParse };

// An undo affordance an action tool surfaces to the chat. The client reverses the
// move by deleting the period we opened and re-opening the one we closed — the
// same inverse the map's drag-drop Undo applies.
export type ChatUndo = {
  label: string;
  openedEventId: string | null;
  closedEventId: string | null;
};

// What an action tool returns: a summary fed back to the model so it can narrate
// the result, plus an optional undo the client renders inline.
export type ActionResult = { summary: string; undo?: ChatUndo };

type ReadTool = {
  name: string;
  kind: "read";
  def: AgentToolDef;
  run: (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<string>;
};

type WriteTool = {
  name: string;
  kind: "write";
  def: AgentToolDef;
  prepare: (
    args: Record<string, unknown>,
    ctx: AgentToolContext,
  ) => Promise<LogProposal>;
};

// An action tool DOES touch the DB, immediately — unlike a write tool's confirm
// card. It mirrors the map's "act now, offer Undo" moves (drag-drop), which are
// reversible, rather than the human-in-the-loop confirm flow used for logs.
type ActionTool = {
  name: string;
  kind: "action";
  def: AgentToolDef;
  run: (
    args: Record<string, unknown>,
    ctx: AgentToolContext,
  ) => Promise<ActionResult>;
};

export type AgentTool = ReadTool | WriteTool | ActionTool;

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// --- log_activity (write) --------------------------------------------------
// The model fills these fields from the farmer's message; we map fuzzy
// names→IDs with the existing resolver and return a confirm-card proposal.
const logActivity: WriteTool = {
  name: "log_activity",
  kind: "write",
  def: {
    type: "function",
    function: {
      name: "log_activity",
      description:
        "Record a farm activity to the log (sowing, watering, amending, " +
        "observing, harvesting, a sale, a cost, etc.). Call this whenever the " +
        "farmer reports something they did or saw, or asks you to log it. The " +
        "user will review and confirm the details before it is saved, so prefer " +
        "logging over asking clarifying questions when the intent is clear.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: eventTypeEnum.options,
            description: "The kind of activity.",
          },
          rawText: {
            type: "string",
            description:
              "The farmer's own phrasing of what happened, verbatim if possible.",
          },
          commonName: {
            type: "string",
            description: "Plant/crop common name, if any (e.g. 'tomato').",
          },
          variety: { type: "string", description: "Variety/cultivar, if named." },
          plantType: {
            type: "string",
            enum: ["crop", "flower", "tree", "breeding_line"],
            description: "Only when a NEW planting is implied.",
          },
          locationName: {
            type: "string",
            description:
              "Where it happened (e.g. 'Bed 2', 'North Field'); match the farm's named areas.",
          },
          occurredAt: {
            type: "string",
            description:
              "When it happened, ISO date or 'today'/'yesterday'. Defaults to now.",
          },
          quantity: { type: "number", description: "Amount, if stated." },
          unit: { type: "string", description: "Unit for quantity (lbs, gallons, bunches…)." },
          amount: { type: "number", description: "Dollar amount for a sale or cost." },
          notes: { type: "string", description: "Any extra detail worth keeping." },
        },
        required: ["type"],
      },
    },
  },
  async prepare(args, ctx) {
    const [locationRows, plantingRows] = await Promise.all([
      db.query.locations.findMany({ where: eq(locations.orgId, ctx.orgId) }),
      db.query.plantings.findMany({ where: eq(plantings.orgId, ctx.orgId) }),
    ]);
    const locationRecords = locationRows.map(serializeLocation);
    const plantingRecords = plantingRows.map(serializePlanting);

    // llmParseOutputSchema is deliberately tolerant — it fills missing keys with
    // null and ignores extras (like rawText), so the model's args map cleanly.
    const parsed = llmParseOutputSchema.parse(args);
    const resolved = resolveParse(parsed, locationRecords, plantingRecords);

    const rawText =
      typeof args.rawText === "string" && args.rawText.trim()
        ? args.rawText.trim()
        : summarizeArgs(parsed.type, args);

    return { rawText, resolved };
  },
};

function summarizeArgs(type: string, args: Record<string, unknown>): string {
  const parts = [type];
  if (typeof args.quantity === "number") {
    parts.push(`${args.quantity}${args.unit ? ` ${args.unit}` : ""}`);
  }
  if (typeof args.commonName === "string") parts.push(args.commonName);
  if (typeof args.locationName === "string") parts.push(`at ${args.locationName}`);
  return parts.join(" ");
}

// --- query_activity (read) -------------------------------------------------
// The system prompt already carries a snapshot, but it's capped at ~15 recent
// events. This lets the agent pull a deeper, filtered slice on demand (e.g.
// "how many times did I water Bed 2?", "total sales this season").
const queryActivity: ReadTool = {
  name: "query_activity",
  kind: "read",
  def: {
    type: "function",
    function: {
      name: "query_activity",
      description:
        "Look up the farmer's logged activity in more depth than the snapshot " +
        "in your context. Use to count events, review history for a place, or " +
        "total up sales/costs before answering.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: eventTypeEnum.options,
            description: "Filter to one activity type. Omit for all types.",
          },
          locationName: {
            type: "string",
            description: "Filter to events at a matching named area. Omit for all.",
          },
          limit: {
            type: "number",
            description: "Max events to return (default 30, max 60).",
          },
        },
      },
    },
  },
  async run(args, ctx) {
    const wantType = eventTypeEnum.safeParse(args.type);
    const limit = Math.min(
      60,
      Math.max(1, typeof args.limit === "number" ? args.limit : 30),
    );

    const rows = await db.query.events.findMany({
      where: wantType.success
        ? and(eq(events.orgId, ctx.orgId), eq(events.type, wantType.data))
        : eq(events.orgId, ctx.orgId),
      orderBy: [desc(events.occurredAt)],
      limit,
    });

    const locationRows = await db.query.locations.findMany({
      where: eq(locations.orgId, ctx.orgId),
    });
    const nameById = new Map(locationRows.map((l) => [l.id, l.name]));

    const wantLocation =
      typeof args.locationName === "string"
        ? args.locationName.toLowerCase().trim()
        : null;
    const filtered = wantLocation
      ? rows.filter((e) =>
          (nameById.get(e.locationId ?? "") ?? "")
            .toLowerCase()
            .includes(wantLocation),
        )
      : rows;

    if (filtered.length === 0) return "No matching activity is logged.";

    const lines = filtered.map((e) => {
      const where = e.locationId ? ` (${nameById.get(e.locationId) ?? "?"})` : "";
      const qty = e.quantity != null ? ` ${e.quantity}${e.unit ? ` ${e.unit}` : ""}` : "";
      const money = e.amount != null ? ` $${e.amount}` : "";
      const note = (e.notes ?? e.rawText ?? "").trim().slice(0, 80);
      return `- ${shortDate(e.occurredAt)} ${e.type}${where}${qty}${money}${note ? `: ${note}` : ""}`;
    });

    const sales = filtered.filter((e) => e.type === "sale" && e.amount != null);
    const costs = filtered.filter((e) => e.type === "cost" && e.amount != null);
    const totals: string[] = [];
    if (sales.length) {
      totals.push(
        `Total sales: $${sales.reduce((s, e) => s + (e.amount ?? 0), 0).toFixed(2)} (${sales.length}).`,
      );
    }
    if (costs.length) {
      totals.push(
        `Total costs: $${costs.reduce((s, e) => s + (e.amount ?? 0), 0).toFixed(2)} (${costs.length}).`,
      );
    }

    return [
      `${filtered.length} matching event(s):`,
      lines.join("\n"),
      ...totals,
    ].join("\n");
  },
};

// --- query_grazing (read) --------------------------------------------------
// The rotation snapshot (where each herd is, days-on, each paddock's rest
// status) computed the same deterministic way the Grazing panel shows it.
const queryGrazing: ReadTool = {
  name: "query_grazing",
  kind: "read",
  def: {
    type: "function",
    function: {
      name: "query_grazing",
      description:
        "Look up the current grazing rotation: where each herd is and how many " +
        "days it has been there, plus each paddock's status (grazing, resting, " +
        "ready, or idle) and rest days. Call this before answering grazing/" +
        "rotation questions or before recommending a move.",
      parameters: {
        type: "object",
        properties: {
          herdName: {
            type: "string",
            description: "Filter to one herd by name. Omit for all herds.",
          },
          paddockName: {
            type: "string",
            description: "Filter to one paddock by name. Omit for all paddocks.",
          },
        },
      },
    },
  },
  async run(args, ctx) {
    const snapshot = await loadGrazingSnapshot(ctx.orgId);

    const herdFilter =
      typeof args.herdName === "string" ? args.herdName.toLowerCase().trim() : null;
    const paddockFilter =
      typeof args.paddockName === "string"
        ? args.paddockName.toLowerCase().trim()
        : null;

    const herdStates = snapshot.herds.filter(
      (h) => !herdFilter || h.name.toLowerCase().includes(herdFilter),
    );
    const paddockStates = snapshot.paddocks.filter(
      (p) => !paddockFilter || p.name.toLowerCase().includes(paddockFilter),
    );

    if (herdStates.length === 0 && paddockStates.length === 0) {
      return "No herds or paddocks match.";
    }

    const herdLines = herdStates.map((h) =>
      h.currentLocationName
        ? `- ${h.name}: on ${h.currentLocationName} (${h.daysOn ?? 0} day${h.daysOn === 1 ? "" : "s"})`
        : `- ${h.name}: off pasture`,
    );
    const paddockLines = paddockStates.map((p) => {
      const rest =
        p.status === "grazing"
          ? `grazing now${p.daysOn != null ? ` (${p.daysOn}d on)` : ""}`
          : p.status === "idle"
            ? "idle (not yet grazed)"
            : p.restDays != null
              ? `${p.status} (rested ${p.restDays}${p.restTargetDays != null ? ` of ${p.restTargetDays}` : ""}d)`
              : p.status;
      return `- ${p.name}: ${rest}, ${p.acres.toFixed(2)} ac`;
    });

    return [
      herdStates.length ? `Herds:\n${herdLines.join("\n")}` : null,
      paddockStates.length ? `Paddocks:\n${paddockLines.join("\n")}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  },
};

// --- move_herd (action) ----------------------------------------------------
// Executes a rotation move immediately (closing the open period, opening a new
// one on the destination) and hands the chat an Undo. This mirrors the map's
// drag-drop move, which is also act-now-with-Undo rather than confirm-first.
const moveHerd: ActionTool = {
  name: "move_herd",
  kind: "action",
  def: {
    type: "function",
    function: {
      name: "move_herd",
      description:
        "Move a herd to a paddock (or off pasture) NOW. This records the move " +
        "immediately; the farmer gets an Undo. Only call it when the farmer " +
        "clearly asks to move stock — not to merely discuss options. To suggest " +
        "a move without making it, just answer in text.",
      parameters: {
        type: "object",
        properties: {
          herdName: {
            type: "string",
            description:
              "Which herd to move, by name. Omit only if the farm has exactly one herd.",
          },
          toPaddockName: {
            type: "string",
            description: "Destination paddock name. Omit when moving off pasture.",
          },
          offPasture: {
            type: "boolean",
            description: "True to move the herd OFF pasture (no destination).",
          },
          heightInIn: {
            type: "number",
            description: "Forage height (inches) of the destination at move-in, if stated.",
          },
          heightOutIn: {
            type: "number",
            description: "Forage height (inches) of the paddock being left, if stated.",
          },
          occurredAt: {
            type: "string",
            description: "When the move happened, ISO date or 'today'/'yesterday'. Defaults to now.",
          },
          notes: { type: "string", description: "Any extra detail worth keeping." },
        },
      },
    },
  },
  async run(args, ctx) {
    const [herdRows, locationRows] = await Promise.all([
      db.query.herds.findMany({ where: eq(herds.orgId, ctx.orgId) }),
      db.query.locations.findMany({ where: eq(locations.orgId, ctx.orgId) }),
    ]);

    // Resolve the herd: by name, or the only one if unnamed.
    const wantHerd =
      typeof args.herdName === "string" ? args.herdName.toLowerCase().trim() : null;
    const herd = wantHerd
      ? herdRows.find((h) => h.name.toLowerCase().includes(wantHerd))
      : herdRows.length === 1
        ? herdRows[0]
        : null;
    if (!herd) {
      if (herdRows.length === 0) return { summary: "There are no herds to move yet." };
      const names = herdRows.map((h) => h.name).join(", ");
      return {
        summary: wantHerd
          ? `I couldn't find a herd named "${args.herdName}". Herds: ${names}.`
          : `Which herd? There are several: ${names}.`,
      };
    }

    // Resolve the destination (a paddock location), unless moving off pasture.
    const offPasture = args.offPasture === true;
    let toLocationId: string | null = null;
    if (!offPasture) {
      const wantPaddock =
        typeof args.toPaddockName === "string"
          ? args.toPaddockName.toLowerCase().trim()
          : null;
      if (!wantPaddock) {
        return {
          summary:
            "Which paddock should they move onto? (or say to move them off pasture)",
        };
      }
      const paddock = locationRows.find(
        (l) => l.type === "paddock" && l.name.toLowerCase().includes(wantPaddock),
      );
      if (!paddock) {
        const names = locationRows
          .filter((l) => l.type === "paddock")
          .map((l) => l.name)
          .join(", ");
        return {
          summary: `I couldn't find a paddock named "${args.toPaddockName}".${names ? ` Paddocks: ${names}.` : ""}`,
        };
      }
      toLocationId = paddock.id;
    }

    try {
      const result = await applyHerdMove({
        orgId: ctx.orgId,
        userId: ctx.userId,
        herdId: herd.id,
        toLocationId,
        heightInIn: typeof args.heightInIn === "number" ? args.heightInIn : undefined,
        heightOutIn: typeof args.heightOutIn === "number" ? args.heightOutIn : undefined,
        occurredAt: typeof args.occurredAt === "string" ? args.occurredAt : undefined,
        notes: typeof args.notes === "string" ? args.notes : undefined,
      });

      const where = result.destinationName
        ? `onto ${result.destinationName}`
        : "off pasture";
      const label = `Moved ${result.herdName} ${where}`;
      const leftNote = result.closed
        ? ` (closed its period that started ${shortDate(new Date(result.closed.movedInAt))})`
        : "";
      return {
        summary: `Done — moved ${result.herdName} ${where}${leftNote}. Tell the farmer it's recorded and can be undone.`,
        undo: {
          label,
          openedEventId: result.opened?.id ?? null,
          closedEventId: result.closed?.id ?? null,
        },
      };
    } catch (err) {
      // A known move failure (e.g. nothing to move off) is information the model
      // should relay; anything else bubbles to the loop's generic handler.
      if (err instanceof HerdMoveError) return { summary: err.message };
      throw err;
    }
  },
};

// Load the deterministic rotation snapshot for an org (same inputs the advisor
// route feeds buildGrazingSnapshot).
async function loadGrazingSnapshot(orgId: string) {
  const [herdRows, paddockRows, locationRows, eventRows] = await Promise.all([
    db.query.herds.findMany({ where: eq(herds.orgId, orgId) }),
    db.query.paddocks.findMany({ where: eq(paddocks.orgId, orgId) }),
    db.query.locations.findMany({ where: eq(locations.orgId, orgId) }),
    db.query.grazingEvents.findMany({ where: eq(grazingEvents.orgId, orgId) }),
  ]);
  return buildGrazingSnapshot(
    herdRows.map(serializeHerd),
    paddockRows.map(serializePaddock),
    locationRows.map(serializeLocation),
    eventRows.map(serializeGrazingEvent),
  );
}

export const AGENT_TOOLS: AgentTool[] = [
  logActivity,
  queryActivity,
  queryGrazing,
  moveHerd,
];

export const AGENT_TOOL_BY_NAME: Record<string, AgentTool> = Object.fromEntries(
  AGENT_TOOLS.map((t) => [t.name, t]),
);

export const AGENT_TOOL_DEFS: AgentToolDef[] = AGENT_TOOLS.map((t) => t.def);
