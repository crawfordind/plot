const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";
const FALLBACK_MODEL = "deepseek/deepseek-v4-flash";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type CompletionOpts = { maxTokens?: number; temperature?: number };

async function requestCompletion(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  opts: Required<CompletionOpts>,
) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Plot",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${model}: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error(`${model}: empty response`);
  }

  return content;
}

export async function chatCompletion(messages: ChatMessage[], opts: CompletionOpts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const primary = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL ?? FALLBACK_MODEL;
  const resolved = { maxTokens: opts.maxTokens ?? 400, temperature: opts.temperature ?? 0.1 };

  try {
    return await requestCompletion(primary, messages, apiKey, resolved);
  } catch (primaryError) {
    if (primary === fallback) throw primaryError;

    try {
      return await requestCompletion(fallback, messages, apiKey, resolved);
    } catch {
      throw primaryError;
    }
  }
}

// Multimodal message content for vision calls (OpenAI/OpenRouter shape).
type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type VisionMessage = {
  role: "system" | "user" | "assistant";
  content: string | VisionContentPart[];
};

async function requestVision(
  model: string,
  messages: VisionMessage[],
  apiKey: string,
  maxTokens: number,
): Promise<string> {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Plot",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${model}: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error(`${model}: empty response`);
  }

  return content;
}

// Vision completion for image analysis. Defaults to OPENROUTER_VISION_MODEL, then
// the regular OPENROUTER_MODEL (gemini-2.5-flash-lite is vision-capable). A
// fallback only kicks in when OPENROUTER_VISION_FALLBACK_MODEL is set, since the
// text fallback may not accept images.
export async function visionCompletion(
  messages: VisionMessage[],
  opts: { maxTokens?: number } = {},
) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const maxTokens = opts.maxTokens ?? 900;
  const primary =
    process.env.OPENROUTER_VISION_MODEL ??
    process.env.OPENROUTER_MODEL ??
    DEFAULT_MODEL;
  const fallback = process.env.OPENROUTER_VISION_FALLBACK_MODEL;

  try {
    return await requestVision(primary, messages, apiKey, maxTokens);
  } catch (primaryError) {
    if (!fallback || fallback === primary) throw primaryError;
    try {
      return await requestVision(fallback, messages, apiKey, maxTokens);
    } catch {
      throw primaryError;
    }
  }
}
