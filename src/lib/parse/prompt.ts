import type { PlantingRecord, LocationRecord } from "@/lib/types";

type PromptContext = {
  locations: LocationRecord[];
  plantings: PlantingRecord[];
  selectedLocationId?: string;
  today: string;
  clarification?: string;
};

export function buildParsePrompt(context: PromptContext) {
  const selectedLocation = context.selectedLocationId
    ? context.locations.find((l) => l.id === context.selectedLocationId)
    : null;

  const locationList =
    context.locations.length > 0
      ? context.locations.map((l) => `- ${l.name} (${l.type})`).join("\n")
      : "(none yet)";

  const plantingList =
    context.plantings.length > 0
      ? context.plantings
          .map((p) => {
            const loc = context.locations.find((l) => l.id === p.locationId);
            return `- ${p.commonName}${p.variety ? ` (${p.variety})` : ""} @ ${loc?.name ?? "unknown"}`;
          })
          .join("\n")
      : "(none yet)";

  return `You extract structured farm log entries from plain-language notes.

Today is ${context.today}.
${selectedLocation ? `The user is currently viewing location: ${selectedLocation.name}. Prefer this unless the note clearly names another spot.` : ""}
${context.clarification ? `\nThe user clarified: "${context.clarification}"\n` : ""}

Known locations:
${locationList}

Known plantings:
${plantingList}

Return a single JSON object for one action. If the note clearly describes multiple distinct actions (e.g. sowed then watered), return a JSON array with one object per action, in order.

JSON schema:
{
  "type": "sow|transplant|water|amend|observe|harvest|cross|seed_save|sale|cost|other",
  "commonName": string|null,
  "variety": string|null,
  "plantType": "crop|flower|tree|breeding_line"|null,
  "locationName": string|null,
  "occurredAt": ISO-8601 datetime string|null (infer from words like "today", "yesterday", or explicit dates),
  "quantity": number|null,
  "unit": string|null,
  "amount": number|null (dollars for sale/cost),
  "notes": string|null (extra context not captured elsewhere),
  "motherVariety": string|null (breeding crosses),
  "fatherVariety": string|null (breeding crosses),
  "clarifyingQuestion": string|null (ask AT MOST ONE question only if location or plant is critical and truly ambiguous),
  "suggestNewPlanting": boolean (true if a plant/variety is named but likely not in known plantings)
}

Rules:
- One action → one object. Multiple clear actions → array of objects (preferred).
- Never wrap in { "events": [...] }.
- Prefer matching known location and planting names when possible.
- Parse dates like 6/6/26 as 2026-06-06.
- For sales like "$4 each" with a count, set quantity, unit, and amount appropriately.
- For crosses, set type to "cross" and fill motherVariety/fatherVariety.
- If the note is vague but still loggable, use type "observe" and leave clarifyingQuestion null.
- Never invent locations or plants not mentioned.`;
}
