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

// Stream a chat completion as plain text deltas. Unlike chatCompletion this does
// NOT force a JSON response_format — the chat UI wants free-form markdown that it
// can render token-by-token. Yields content fragments as they arrive over SSE.
export async function* streamChatCompletion(
  messages: ChatMessage[],
  opts: CompletionOpts = {},
): AsyncGenerator<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const primary = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL ?? FALLBACK_MODEL;
  const resolved = { maxTokens: opts.maxTokens ?? 700, temperature: opts.temperature ?? 0.4 };

  try {
    yield* streamRequest(primary, messages, apiKey, resolved);
  } catch (primaryError) {
    if (primary === fallback) throw primaryError;
    try {
      yield* streamRequest(fallback, messages, apiKey, resolved);
    } catch {
      throw primaryError;
    }
  }
}

async function* streamRequest(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  opts: Required<CompletionOpts>,
): AsyncGenerator<string> {
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
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`${model}: ${response.status} ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // OpenRouter streams Server-Sent Events: lines of "data: {json}" separated by
  // blank lines, plus periodic ": OPENROUTER PROCESSING" comments we skip.
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      } catch {
        // Partial JSON across chunk boundaries is rare with line buffering, but
        // tolerate it: skip this line rather than aborting the whole stream.
      }
    }
  }
}

// === Agentic tool-calling ===
// Unlike streamChatCompletion (pure text), this path lets the model call tools.
// One model turn streams: text deltas as they arrive, then — if the model decided
// to act — a single batch of accumulated tool calls at the end. The caller (the
// chat route) runs read tools and feeds results back, or surfaces write tools to
// the user for confirmation, then loops.

export type AgentToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    // JSON Schema for the arguments object.
    parameters: Record<string, unknown>;
  };
};

export type AgentToolCall = { id: string; name: string; arguments: string };

// Conversation messages in the OpenAI/OpenRouter shape, extended with the tool
// roles the agent loop needs (assistant-with-tool_calls and tool results).
export type AgentMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type AgentChunk =
  | { type: "text"; value: string }
  | { type: "tool_calls"; calls: AgentToolCall[] };

// Stream one agent turn. Yields text fragments as they arrive, then a final
// `tool_calls` chunk if the model wants to act this turn (never both interleaved:
// text first, tool calls last).
export async function* streamAgentCompletion(
  messages: AgentMessage[],
  tools: AgentToolDef[],
  opts: CompletionOpts = {},
): AsyncGenerator<AgentChunk> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const primary = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL ?? FALLBACK_MODEL;
  const resolved = { maxTokens: opts.maxTokens ?? 900, temperature: opts.temperature ?? 0.4 };

  try {
    yield* streamAgentRequest(primary, messages, tools, apiKey, resolved);
  } catch (primaryError) {
    if (primary === fallback) throw primaryError;
    try {
      yield* streamAgentRequest(fallback, messages, tools, apiKey, resolved);
    } catch {
      throw primaryError;
    }
  }
}

async function* streamAgentRequest(
  model: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  apiKey: string,
  opts: Required<CompletionOpts>,
): AsyncGenerator<AgentChunk> {
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
      tools,
      tool_choice: "auto",
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`${model}: ${response.status} ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  // Tool calls stream in fragments keyed by their position in the array: `id`
  // and `function.name` arrive first, then `function.arguments` accumulates over
  // many deltas. We stitch them back together here.
  const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();

  while (!finished) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        finished = true;
        break;
      }
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta;
        const content = delta?.content;
        if (typeof content === "string" && content) {
          yield { type: "text", value: content };
        }
        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === "number" ? tc.index : 0;
            const cur = toolAcc.get(idx) ?? { id: "", name: "", arguments: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name = tc.function.name;
            if (typeof tc.function?.arguments === "string") {
              cur.arguments += tc.function.arguments;
            }
            toolAcc.set(idx, cur);
          }
        }
      } catch {
        // Tolerate a partial/garbled line rather than aborting the stream.
      }
    }
  }

  if (toolAcc.size > 0) {
    const calls = [...toolAcc.values()].filter((c) => c.name);
    if (calls.length) {
      // A tool call with no id is unusable for the result message; synthesize one.
      yield {
        type: "tool_calls",
        calls: calls.map((c, i) => ({
          id: c.id || `call_${i}`,
          name: c.name,
          arguments: c.arguments || "{}",
        })),
      };
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
