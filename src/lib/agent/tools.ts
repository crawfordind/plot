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
import { events, locations, plantings } from "@/db/schema";
import { resolveParse } from "@/lib/parse/resolve";
import {
  eventTypeEnum,
  llmParseOutputSchema,
  type ResolvedParse,
} from "@/lib/parse/schema";
import { serializeLocation, serializePlanting } from "@/lib/serializers";
import type { AgentToolDef } from "@/lib/openrouter";

export type AgentToolContext = {
  orgId: string;
  focusedFarmId?: string | null;
};

// What a write tool hands back for the user to confirm — the same shape
// ParseConfirmCard already consumes.
export type LogProposal = { rawText: string; resolved: ResolvedParse };

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

export type AgentTool = ReadTool | WriteTool;

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

export const AGENT_TOOLS: AgentTool[] = [logActivity, queryActivity];

export const AGENT_TOOL_BY_NAME: Record<string, AgentTool> = Object.fromEntries(
  AGENT_TOOLS.map((t) => [t.name, t]),
);

export const AGENT_TOOL_DEFS: AgentToolDef[] = AGENT_TOOLS.map((t) => t.def);
