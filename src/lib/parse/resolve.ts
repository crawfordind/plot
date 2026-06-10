import { matchLocation, matchPlanting } from "@/lib/parse/match";
import type { LlmParseOutput, ResolvedParse } from "@/lib/parse/schema";
import type { LocationRecord, PlantingRecord } from "@/lib/types";

function resolveOccurredAt(value: string | null, today: Date) {
  if (value) {
    const slash = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slash) {
      const month = Number(slash[1]) - 1;
      const day = Number(slash[2]);
      let year = Number(slash[3]);
      if (year < 100) year += 2000;
      const parsed = new Date(year, month, day, 12);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return today.toISOString();
}

export function resolveParse(
  output: LlmParseOutput,
  locations: LocationRecord[],
  plantings: PlantingRecord[],
  options: { selectedLocationId?: string; today?: Date } = {},
): ResolvedParse {
  const today = options.today ?? new Date();
  const locationMatch = matchLocation(
    output.locationName,
    locations,
    options.selectedLocationId,
  );
  const plantingMatch = matchPlanting(output, plantings, locationMatch?.id ?? null);

  const suggestNewPlanting =
    output.suggestNewPlanting ||
    (!!output.commonName && !plantingMatch && output.type !== "sale" && output.type !== "cost");

  let clarifyingQuestion = output.clarifyingQuestion;
  if (!locationMatch && locations.length > 0 && !options.selectedLocationId && !clarifyingQuestion) {
    clarifyingQuestion = "Which location should this log go to?";
  }

  return {
    type: output.type,
    commonName: output.commonName,
    variety: output.variety,
    plantType: output.plantType,
    locationId: locationMatch?.id ?? options.selectedLocationId ?? null,
    locationName: locationMatch?.name ?? output.locationName,
    plantingId: plantingMatch?.id ?? null,
    plantingLabel: plantingMatch?.label ?? null,
    occurredAt: resolveOccurredAt(output.occurredAt, today),
    quantity: output.quantity,
    unit: output.unit,
    amount: output.amount,
    notes: output.notes,
    motherVariety: output.motherVariety,
    fatherVariety: output.fatherVariety,
    suggestNewPlanting,
    clarifyingQuestion,
  };
}
