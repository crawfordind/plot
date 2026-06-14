import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z, ZodError } from "zod";
import { db } from "@/db";
import { chatAttachments, chatMessages, conversations } from "@/db/schema";
import { jsonError, requireOrg } from "@/lib/api";
import { buildAttachmentBlock } from "@/lib/chat/attachmentContext";
import { buildFarmContext } from "@/lib/experts/context";
import {
  EXPERT_BY_ID,
  isExpertId,
  type Expert,
  type ExpertId,
} from "@/lib/experts/personas";
import { chatCompletion, streamChatCompletion } from "@/lib/openrouter";

// Streaming is request-scoped; never cache.
export const dynamic = "force-dynamic";

// How much of the thread we replay to the model (after grouping turns).
const MAX_HISTORY = 16;

const sendSchema = z.object({
  expertIds: z
    .array(z.string())
    .min(1, "Pick at least one expert")
    .max(3, "Pick up to three experts")
    .refine((ids) => ids.every(isExpertId), "Unknown expert"),
  content: z.string().trim().min(1, "Say something first").max(8000),
  attachmentIds: z.array(z.string()).max(8).optional(),
});

type Params = { params: Promise<{ id: string }> };
type ChatTurn = { role: "user" | "assistant"; content: string };

// Send a message and stream the expert reply (or replies) back as SSE. Each
// selected expert runs as its own completion in parallel; events are tagged with
// the expertId so the client can route deltas to the right card.
export async function POST(request: Request, { params }: Params) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;
  const { id: conversationId } = await params;

  const convo = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.orgId, org.id),
      eq(conversations.userId, user.id),
    ),
  });
  if (!convo) return jsonError("Conversation not found", 404);

  let body: z.infer<typeof sendSchema>;
  try {
    body = sendSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues.map((i) => i.message).join(", "));
    }
    return jsonError("Invalid request");
  }

  const expertIds = [...new Set(body.expertIds as ExpertId[])];
  const experts = expertIds.map((id) => EXPERT_BY_ID[id]);
  const slices = [...new Set(experts.flatMap((e) => e.slices))];

  // Persist the user's message before we start generating.
  const userMessageId = nanoid();
  await db.insert(chatMessages).values({
    id: userMessageId,
    orgId: org.id,
    conversationId,
    role: "user",
    content: body.content,
  });

  // Link any uploaded attachments to this message and gather their context. The
  // files were already processed (vision/text) at upload time.
  let attachmentBlock = "";
  if (body.attachmentIds?.length) {
    const rows = await db.query.chatAttachments.findMany({
      where: and(
        eq(chatAttachments.conversationId, conversationId),
        eq(chatAttachments.orgId, org.id),
      ),
    });
    const wanted = rows.filter(
      (r) => body.attachmentIds!.includes(r.id) && !r.messageId,
    );
    for (const r of wanted) {
      await db
        .update(chatAttachments)
        .set({ messageId: userMessageId })
        .where(eq(chatAttachments.id, r.id));
    }
    attachmentBlock = buildAttachmentBlock(
      wanted.map((r) => ({
        fileName: r.fileName,
        kind: r.kind,
        extractedText: r.extractedText,
        visionSummary: r.visionSummary,
      })),
    );
  }

  // Shared farm context (union of the selected experts' slices).
  let context: { text: string; chips: string[] };
  try {
    context = await buildFarmContext(org.id, slices);
  } catch (err) {
    console.error("[conversations/messages] context build failed:", err);
    return jsonError("Couldn't load your farm context", 500);
  }

  // Replay history (incl. the message we just stored), grouped into chat turns.
  const priorRows = await db.query.chatMessages.findMany({
    where: eq(chatMessages.conversationId, conversationId),
    orderBy: [asc(chatMessages.createdAt)],
  });
  const history = groupTurns(priorRows).slice(-MAX_HISTORY);

  const multi = experts.length > 1;
  const sharedContext = [
    "",
    "=== FARM CONTEXT (the farmer's current data) ===",
    context.text || "No farm data is available yet.",
    attachmentBlock ? `\n${attachmentBlock}` : "",
  ].join("\n");

  const systemFor = (e: Expert): string =>
    [
      "You are part of Plot's farm advisory panel, helping a working farmer who runs a farm-mapping app.",
      multi
        ? `You are one of ${experts.length} experts answering this question. Stay strictly within your own discipline, give one focused answer, and don't cover the others' areas.`
        : "",
      `You are ${e.name}, ${e.title}.`,
      e.systemPrompt,
      "Be practical and concise. Ground advice in the FARM CONTEXT and any ATTACHED FILES when relevant, and say when you're assuming. Never invent farm data that isn't provided. Use markdown (bold, bullets, tables) but keep it tight.",
      sharedContext,
    ]
      .filter(Boolean)
      .join("\n");

  const maxTokens = multi ? 700 : 900;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (evt: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));

      const runExpert = async (e: Expert) => {
        let acc = "";
        try {
          for await (const delta of streamChatCompletion(
            [{ role: "system", content: systemFor(e) }, ...history],
            { maxTokens, temperature: 0.4 },
          )) {
            acc += delta;
            send({ type: "delta", expertId: e.id, text: delta });
          }
        } catch (err) {
          console.error(`[conversations/messages] expert ${e.id} failed:`, err);
          if (!acc) {
            send({
              type: "error",
              expertId: e.id,
              message: "This expert is unavailable right now.",
            });
            return;
          }
        }
        const text = acc.trim();
        if (text) {
          await db.insert(chatMessages).values({
            id: nanoid(),
            orgId: org.id,
            conversationId,
            role: "assistant",
            expertId: e.id,
            content: text,
          });
        }
        send({ type: "done", expertId: e.id });
      };

      // Generate a title from the first message, concurrently with the replies.
      const titleTask = async () => {
        if (convo.title) return;
        try {
          const raw = await chatCompletion(
            [
              {
                role: "system",
                content:
                  'Generate a short chat title (3–6 words, Title Case, no surrounding quotes) summarizing the user\'s message. Return JSON {"title":"..."}.',
              },
              { role: "user", content: body.content.slice(0, 500) },
            ],
            { maxTokens: 30, temperature: 0.2 },
          );
          const parsed = JSON.parse(raw) as { title?: unknown };
          const title =
            typeof parsed.title === "string" ? parsed.title.trim().slice(0, 80) : "";
          if (title) {
            await db
              .update(conversations)
              .set({ title })
              .where(eq(conversations.id, conversationId));
            send({ type: "title", title });
          }
        } catch (err) {
          console.error("[conversations/messages] title gen failed:", err);
        }
      };

      try {
        await Promise.all([...experts.map(runExpert), titleTask()]);
        // Bump recency and remember the expert selection for next time.
        await db
          .update(conversations)
          .set({ updatedAt: new Date(), expertIds: JSON.stringify(expertIds) })
          .where(eq(conversations.id, conversationId));
        send({ type: "end" });
      } catch (err) {
        console.error("[conversations/messages] stream failed:", err);
        send({ type: "end" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering so deltas reach the client immediately.
      "X-Accel-Buffering": "no",
    },
  });
}

// Collapse stored rows into model turns: consecutive assistant rows (a single
// multi-expert turn) merge into one labeled assistant message so even a
// single-expert follow-up sees coherent prior context.
function groupTurns(
  rows: { role: "user" | "assistant"; expertId: string | null; content: string }[],
): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const r of rows) {
    if (r.role === "user") {
      out.push({ role: "user", content: r.content });
      continue;
    }
    const label =
      r.expertId && isExpertId(r.expertId)
        ? `${EXPERT_BY_ID[r.expertId].title}: `
        : "";
    const piece = `${label}${r.content}`;
    const last = out[out.length - 1];
    if (last && last.role === "assistant") last.content += `\n\n${piece}`;
    else out.push({ role: "assistant", content: piece });
  }
  return out;
}
