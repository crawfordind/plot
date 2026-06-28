import type { LocationRecord } from "@/lib/types";

type StructurePromptContext = {
  locations: LocationRecord[];
};

// Drives the cheap LLM that turns "two hoop houses, two beds in each, two rows
// per bed" into a nested structure tree. Kept tight and example-led so small,
// low-cost models stay reliable.
export function buildStructurePrompt(context: StructurePromptContext) {
  const existing =
    context.locations.length > 0
      ? context.locations.map((l) => `- ${l.name} (${l.type})`).join("\n")
      : "(none yet)";

  return `You turn a grower's plain-language description of their farm into a nested map structure.

Existing locations (avoid duplicating these):
${existing}

Allowed types, from largest to smallest:
- farm: the whole property
- field: an open growing area
- zone: a named sub-area
- hoophouse: a hoop house / high tunnel / poly tunnel
- greenhouse: a greenhouse / glasshouse (use this when they say "greenhouse", not hoophouse)
- bed: a growing bed inside a field, zone, hoophouse, or greenhouse
- row: a single row of plants inside a bed (drawn as a line)
- alley: a walking path (drawn as a line)
- fence: a fence line / perimeter (drawn as a line)

Return ONE JSON object:
{
  "nodes": [
    {
      "type": "<one of the allowed types>",
      "name": "<base name, no trailing number>",
      "count": <integer> | null,   // how many of this node; null or 1 means one
      "children": [ ...same shape... ] | null
    }
  ],
  "summary": "<one short sentence describing what you built>" | null
}

Rules:
- Nest smaller things inside larger ones via "children" (max depth 4).
- Use "count" to replicate siblings instead of repeating nodes. count:2 bed → "Bed 1", "Bed 2".
- "name" is the base label only — never include the number yourself.
- Containers are hoophouse, greenhouse, bed, field, zone, farm. Lines are row, alley, fence.
- Only build what the grower describes. Do not invent extra structures.
- If the description is too vague to place anything, return {"nodes": [], "summary": "<one clarifying question>"}.

Example input: "two hoop houses, two beds in each, and two rows of plants per bed"
Example output:
{"nodes":[{"type":"hoophouse","name":"Hoop House","count":2,"children":[{"type":"bed","name":"Bed","count":2,"children":[{"type":"row","name":"Row","count":2,"children":null}]}]}],"summary":"Created 2 hoop houses, each with 2 beds of 2 rows."}`;
}
