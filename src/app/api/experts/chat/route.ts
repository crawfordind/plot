import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { jsonError, requireOrg } from "@/lib/api";
import { chatCompletion } from "@/lib/openrouter";
import { buildFarmContext } from "@/lib/experts/context";
import { EXPERT_BY_ID, isExpertId, type ExpertId } from "@/lib/experts/personas";

// Keep the prompt (and cost) bounded: only the tail of the thread is sent.
const MAX_HISTORY = 12;

const chatSchema = z.object({
  expertIds: z
    .array(z.string())
    .min(1, "Pick at least one expert")
    .max(3, "Pick up to three experts")
    .refine((ids) => ids.every(isExpertId), "Unknown expert"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1, "Say something first")
    .max(40),
});

type Answer = { expertId: ExpertId; text: string };

export async function POST(request: Request) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  let body: z.infer<typeof chatSchema>;
  try {
    body = chatSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues.map((i) => i.message).join(", "));
    }
    return jsonError("Invalid request");
  }

  // De-dupe + preserve the order the user picked.
  const expertIds = [...new Set(body.expertIds as ExpertId[])];
  const experts = expertIds.map((id) => EXPERT_BY_ID[id]);
  const slices = [...new Set(experts.flatMap((e) => e.slices))];

  let context: { text: string; chips: string[] };
  try {
    context = await buildFarmContext(org.id, slices);
  } catch (err) {
    console.error("[experts/chat] context build failed:", err);
    return jsonError("Couldn't load your farm context", 500);
  }

  const multi = experts.length > 1;
  const systemPrompt = [
    "You are Plot's farm advisory panel, helping a working farmer who runs a farm-mapping app.",
    multi
      ? `Answer as ${experts.length} distinct experts. Each speaks only within their own discipline, gives one focused answer, and does not repeat the others — it's fine for one to briefly defer to or build on another.`
      : "Answer as the single expert below.",
    "Be concise and practical: short paragraphs or tight bullet lists, no preamble or sign-off. Ground advice in the FARM CONTEXT when relevant and say so when you are assuming. Never invent farm data that isn't in the context. If a question falls outside every listed expert's domain, say so briefly.",
    "",
    "=== THE EXPERT(S) ON THIS CALL ===",
    experts
      .map((e) => `[${e.id}] ${e.name}, ${e.title}.\n${e.systemPrompt}`)
      .join("\n\n"),
    "",
    "=== FARM CONTEXT (the farmer's current data) ===",
    context.text || "No farm data is available yet.",
    "",
    "=== RESPONSE FORMAT ===",
    'Return a JSON object: {"answers":[{"expertId":"<id>","text":"<reply>"}]}.',
    `Include exactly one entry for each of these expert ids, in this order: ${expertIds
      .map((id) => `"${id}"`)
      .join(", ")}. Use markdown inside "text" (bullets, bold) but no headings.`,
  ].join("\n");

  const history = body.messages.slice(-MAX_HISTORY);
  const maxTokens = Math.min(1200, 600 + (experts.length - 1) * 320);

  let raw: string;
  try {
    raw = await chatCompletion(
      [{ role: "system", content: systemPrompt }, ...history],
      { maxTokens, temperature: 0.4 },
    );
  } catch {
    return jsonError("The experts are unavailable right now. Try again in a moment.", 502);
  }

  const answers = parseAnswers(raw, expertIds);
  return NextResponse.json({ answers, contextChips: context.chips });
}

// The model returns JSON, but be defensive: tolerate a stray wrapper, missing
// ids, or a flat string, and always hand back something renderable.
function parseAnswers(raw: string, expectedIds: ExpertId[]): Answer[] {
  try {
    const data = JSON.parse(raw) as { answers?: unknown };
    const list = Array.isArray(data.answers) ? data.answers : [];
    const byId = new Map<ExpertId, string>();
    for (const item of list) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Answer).expertId === "string" &&
        isExpertId((item as Answer).expertId) &&
        typeof (item as Answer).text === "string"
      ) {
        byId.set((item as Answer).expertId, (item as Answer).text.trim());
      }
    }
    const ordered = expectedIds
      .filter((id) => byId.has(id))
      .map((id) => ({ expertId: id, text: byId.get(id)! }));
    if (ordered.length) return ordered;
  } catch {
    // fall through to the raw-string fallback
  }
  return [{ expertId: expectedIds[0], text: raw.trim() || "(no response)" }];
}
