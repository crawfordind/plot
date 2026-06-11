import type {
  GrazingEventRecord,
  HerdRecord,
  LocationRecord,
} from "@/lib/types";

type MovePromptContext = {
  herds: HerdRecord[];
  paddocks: LocationRecord[];
  openEvents: GrazingEventRecord[];
  today: string;
  clarification?: string;
};

// Turns "moved the sheep onto paddock 3, grass about 8 inches" into a structured
// move. Kept tight and example-led so small, low-cost models stay reliable
// (mirrors src/lib/structure/prompt.ts and src/lib/parse/prompt.ts).
export function buildGrazingMovePrompt(context: MovePromptContext) {
  const herdList =
    context.herds.length > 0
      ? context.herds.map((h) => `- ${h.name} (${h.species})`).join("\n")
      : "(none yet)";

  const paddockList =
    context.paddocks.length > 0
      ? context.paddocks.map((p) => `- ${p.name}`).join("\n")
      : "(none yet)";

  const currentList =
    context.openEvents.length > 0
      ? context.openEvents
          .map((e) => {
            const herd = context.herds.find((h) => h.id === e.herdId);
            const loc = context.paddocks.find((l) => l.id === e.locationId);
            return `- ${herd?.name ?? "herd"} is on ${loc?.name ?? "a paddock"}`;
          })
          .join("\n")
      : "(no herds currently on pasture)";

  return `You convert a grazier's plain-language note into one structured herd move.

Today is ${context.today}.
${context.clarification ? `The user clarified: "${context.clarification}"\n` : ""}
Herds:
${herdList}

Paddocks:
${paddockList}

Where herds are right now:
${currentList}

Return ONE JSON object:
{
  "action": "move" | "move_in" | "move_out",
  "herdName": "<the herd being moved, matching a known herd>" | null,
  "paddockName": "<the paddock being moved ONTO, matching a known paddock>" | null,
  "occurredAt": "<ISO-8601 datetime, infer from 'today'/'yesterday'/dates>" | null,
  "heightInIn": <forage height in inches of the paddock moved ONTO> | null,
  "heightOutIn": <forage height in inches of the paddock moved OFF> | null,
  "forageSpecies": "<predominant forage if mentioned>" | null,
  "notes": "<supplemental feed, mowed, fertilized, weather, etc.>" | null,
  "clarifyingQuestion": "<ask AT MOST ONE question, only if herd or target paddock is truly ambiguous>" | null
}

Rules:
- "move" = the herd comes off its current paddock AND onto a new one (most common). Set paddockName to the destination.
- "move_in" = herd goes onto a paddock (none stated as left). "move_out" = herd just comes off pasture; paddockName null.
- Match herd and paddock names to the known lists; never invent names.
- A height like "grass was 8 inches" when moving ONTO a paddock is heightInIn; "grazed down to 3 inches" when leaving is heightOutIn.
- Parse dates like 6/6/26 as 2026-06-06. Default occurredAt to today if only a time-of-day is implied.
- If you cannot tell which herd or destination paddock, set clarifyingQuestion and leave the unknown field null.

Example: "moved the sheep onto paddock 2 this morning, grass about 7 inches, came off paddock 1 at 3 inches"
Output: {"action":"move","herdName":"Sheep","paddockName":"Paddock 2","occurredAt":"${context.today}","heightInIn":7,"heightOutIn":3,"forageSpecies":null,"notes":null,"clarifyingQuestion":null}`;
}

// Turns a planning sentence into forage-animal balance inputs.
export function buildGrazingPlanPrompt(today: string) {
  return `You extract grazing-plan inputs from a producer's description so a forage-animal balance can be computed.

Today is ${today}.

Return ONE JSON object:
{
  "acres": <total grazable acres> | null,
  "forage": "<primary forage name>" | null,
  "forageLbPerAcre": <estimated dry-matter production, lb/acre/year> | null,
  "harvestEfficiency": <0-1 grazing efficiency, e.g. 0.7> | null,
  "animals": [ { "species": "cattle|sheep|goat|horse|poultry|other", "head": <int>, "weightLb": <avg lb per head> } ] | null,
  "restDays": <target paddock recovery in days, e.g. 30> | null,
  "grazeDaysPerPaddock": <days the herd spends on each paddock, e.g. 2> | null,
  "clarifyingQuestion": "<ask AT MOST ONE question only if acres or animals are missing and essential>" | null
}

Rules:
- Map "ewes", "lambs", "flock" → sheep; "cows", "steers" → cattle; "does", "kids" → goat; "horses", "ponies" → horse; "chickens", "hens", "broilers", "layers" → poultry.
- If a weight isn't given, estimate a reasonable average for the species (sheep ~120, goat ~100, cattle ~1100, horse ~1100, poultry ~5).
- Leave forageLbPerAcre/harvestEfficiency null unless the grower gives numbers; the calculator has sensible defaults.
- Only set clarifyingQuestion if acres or the animal list is missing and you cannot proceed.

Example: "6 acres of cool-season grass, 60 sheep about 60 pounds, 30 day rest, two days per paddock"
Output: {"acres":6,"forage":"Cool-Season Grasses","forageLbPerAcre":null,"harvestEfficiency":null,"animals":[{"species":"sheep","head":60,"weightLb":60}],"restDays":30,"grazeDaysPerPaddock":2,"clarifyingQuestion":null}`;
}
