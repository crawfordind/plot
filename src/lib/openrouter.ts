const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";
const FALLBACK_MODEL = "deepseek/deepseek-v4-flash";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

async function requestCompletion(model: string, messages: ChatMessage[], apiKey: string) {
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
      max_tokens: 400,
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

export async function chatCompletion(messages: ChatMessage[]) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const primary = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL ?? FALLBACK_MODEL;

  try {
    return await requestCompletion(primary, messages, apiKey);
  } catch (primaryError) {
    if (primary === fallback) throw primaryError;

    try {
      return await requestCompletion(fallback, messages, apiKey);
    } catch {
      throw primaryError;
    }
  }
}
