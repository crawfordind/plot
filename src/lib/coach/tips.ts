import type { EventType } from "@/lib/types";
import type { ResolvedParse } from "@/lib/parse/schema";

export function getPostParseTip(resolved: ResolvedParse, hasSplit = false) {
  if (hasSplit) {
    return "I found multiple actions in your note — you can save as one log or split them.";
  }

  if (!resolved.locationId && resolved.locationName) {
    return `I'll match "${resolved.locationName}" to your locations — pick the right one if needed.`;
  }

  if (resolved.suggestNewPlanting && resolved.commonName) {
    return `New planting detected for ${resolved.commonName} — I'll create it when you confirm.`;
  }

  const tips: Partial<Record<EventType, string>> = {
    sow: "After sowing, a quick observe log in 7–10 days helps track germination.",
    transplant: "Note spacing and weather — it helps when you compare varieties next year.",
    harvest: "Log quantity and quality now — yield comparisons are gold at season review.",
    sale: "Tag revenue here — season roll-up will show if this crop paid off.",
    cross: "Tag both parents clearly — lineage threads get powerful over generations.",
    seed_save: "Link to the parent planting if you can — seed lineage is your breeding moat.",
  };

  return tips[resolved.type] ?? "Looks good — tap confirm or edit anything I missed.";
}

export function getPostSaveTip(type: EventType) {
  const tips: Partial<Record<EventType, string>> = {
    sow: "Logged. Check back in about a week with a germination note.",
    water: "Logged. Consistent irrigation notes help debug stress later.",
    harvest: "Logged. This feeds your yield history for next season's plan.",
    sale: "Logged. Cashflow roll-up will include this at season review.",
    observe: "Logged. Mid-season observes are the easiest way to catch problems early.",
  };

  return tips[type] ?? "Logged. Keep the rhythm — small notes compound.";
}

export function formatParseSummary(resolved: ResolvedParse) {
  const parts: string[] = [];
  const action = resolved.type.replace("_", " ");
  parts.push(action.charAt(0).toUpperCase() + action.slice(1));

  if (resolved.commonName) {
    parts.push(resolved.commonName);
    if (resolved.variety) parts.push(`(${resolved.variety})`);
  }

  if (resolved.locationName) parts.push(`at ${resolved.locationName}`);

  const date = new Date(resolved.occurredAt);
  if (!Number.isNaN(date.getTime())) {
    parts.push(`on ${date.toLocaleDateString()}`);
  }

  if (resolved.quantity != null) {
    parts.push(`— ${resolved.quantity}${resolved.unit ? ` ${resolved.unit}` : ""}`);
  }

  if (resolved.amount != null) {
    parts.push(`— $${resolved.amount}`);
  }

  return parts.join(" ");
}
