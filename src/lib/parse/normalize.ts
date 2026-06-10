import { llmParseOutputSchema, type LlmParseOutput } from "@/lib/parse/schema";

export type NormalizedParse = {
  primary: LlmParseOutput;
  additional: LlmParseOutput[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mergeNotes(primary: string | null | undefined, extra: string) {
  if (!primary) return extra;
  if (primary.includes(extra)) return primary;
  return `${primary}; ${extra}`;
}

function summarizeEvent(event: Record<string, unknown>) {
  const type = typeof event.type === "string" ? event.type.replace("_", " ") : "action";
  const plant =
    typeof event.commonName === "string"
      ? event.commonName
      : typeof event.variety === "string"
        ? event.variety
        : null;
  return plant ? `${type} ${plant}` : type;
}

function coerceEvent(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    suggestNewPlanting:
      typeof raw.suggestNewPlanting === "boolean" ? raw.suggestNewPlanting : false,
  };
}

function parseEvent(raw: Record<string, unknown>): LlmParseOutput {
  return llmParseOutputSchema.parse(coerceEvent(raw));
}

export function normalizeLlmResponse(raw: unknown): NormalizedParse {
  let candidate: unknown = raw;

  const wrapped = asRecord(candidate);
  if (wrapped?.events && Array.isArray(wrapped.events)) {
    candidate = wrapped.events;
  }

  if (Array.isArray(candidate)) {
    if (candidate.length === 0) {
      throw new Error("Model returned an empty event list");
    }

    const events = candidate.map((item) => coerceEvent(asRecord(item) ?? {}));
    const parsed = events.map((event) => parseEvent(event));

    if (parsed.length === 1) {
      return { primary: parsed[0], additional: [] };
    }

    return {
      primary: parsed[0],
      additional: parsed.slice(1),
    };
  }

  const single = asRecord(candidate);
  if (!single) {
    throw new Error("Model response was not a JSON object");
  }

  return {
    primary: parseEvent(single),
    additional: [],
  };
}

export function mergeIntoSingle(normalized: NormalizedParse): LlmParseOutput {
  if (normalized.additional.length === 0) {
    return normalized.primary;
  }

  const primary = { ...normalized.primary };
  const also = normalized.additional
    .map((event) => summarizeEvent(event as unknown as Record<string, unknown>))
    .join("; ");

  primary.notes = mergeNotes(primary.notes, `Also: ${also}`);
  return primary;
}
