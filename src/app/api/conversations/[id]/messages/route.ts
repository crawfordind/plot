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
import {
  chatCompletion,
  streamAgentCompletion,
  streamChatCompletion,
  type AgentMessage,
  type AgentToolCall,
} from "@/lib/openrouter";
import {
  AGENT_TOOL_BY_NAME,
  AGENT_TOOL_DEFS,
  type AgentToolContext,
} from "@/lib/agent/tools";

// Streaming is request-scoped; never cache.
export const dynamic = "force-dynamic";

// How much of the thread we replay to the model (after grouping turns).
const MAX_HISTORY = 16;

// Hard cap on tool-call round-trips per turn, so a confused model can't loop
// forever calling read tools. Write tools halt the loop on their own.
const AGENT_MAX_STEPS = 4;

const sendSchema = z.object({
  expertIds: z
    .array(z.string())
    .min(1, "Pick at least one expert")
    .max(3, "Pick up to three experts")
    .refine((ids) => ids.every(isExpertId), "Unknown expert"),
  content: z.string().trim().min(1, "Say something first").max(8000),
  attachmentIds: z.array(z.string()).max(8).optional(),
  // The farm currently in the map viewport, so experts default to it when the
  // farmer's question doesn't name a farm.
  focusedFarmId: z.string().optional(),
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
    context = await buildFarmContext(org.id, slices, body.focusedFarmId);
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
      "Be practical and concise. Ground advice in the FARM CONTEXT and any ATTACHED FILES when relevant, and say when you're assuming. Use the DATE, PLACE & WEATHER context to make timing-aware recommendations (current season, today's conditions, the forecast, frost risk, recent rainfall, and soil temperature) rather than generic ones. If the farmer has more than one farm, default to the one marked 'in view' unless they name another farm or ask about all of them — each farm has its own location, weather, and hardiness zone, so don't mix them up. Never invent farm data that isn't provided. Use markdown (bold, bullets, tables) but keep it tight.",
      sharedContext,
    ]
      .filter(Boolean)
      .join("\n");

  // The agentic variant: same persona + context, plus a directive that it can
  // act through tools. Used only for the single-assistant path (see `agentic`).
  const systemForAgent = (e: Expert): string =>
    [
      systemFor(e),
      "",
      "=== ACTING ON THE FARM (you are an agent, not just a chatbot) ===",
      "You can take actions through tools, not only give advice. When the farmer reports something they did or saw — or asks you to log it — call log_activity. The farmer reviews and confirms every action before it is saved, so don't over-ask: infer sensible defaults (today's date, the farm/area in view) and propose the log. Reach for query_activity when answering accurately needs more history than the snapshot above (counts, a place's full history, sales/cost totals). After you propose a log, tell the farmer in one line that it's ready for them to confirm.",
      "",
      "Grazing: call query_grazing to check where herds are and which paddocks are rested before answering rotation questions or recommending a move. When the farmer clearly asks to move stock (e.g. 'move the cows to the north paddock', 'pull them off pasture'), call move_herd — it records the move immediately and the farmer gets an Undo, so you don't need to ask them to confirm first. Only discussing or suggesting a move? Answer in text and don't call the tool.",
    ].join("\n");

  // Single Plot Assistant → agentic loop with tools. The multi-expert panel and
  // the specialists stay advisory-only (pure text), which keeps the SSE protocol
  // unambiguous about who is acting.
  const agentic = experts.length === 1 && experts[0].id === "plot_assistant";
  const toolCtx: AgentToolContext = {
    orgId: org.id,
    userId: user.id,
    focusedFarmId: body.focusedFarmId ?? null,
  };

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

      // The agentic Plot Assistant: stream text, run read tools inline, and
      // surface write tools (logging) to the user as a confirm card, then stop.
      const runAgent = async (e: Expert) => {
        const convoMessages: AgentMessage[] = [
          { role: "system", content: systemForAgent(e) },
          ...history.map((t): AgentMessage => ({ role: t.role, content: t.content })),
        ];
        let acc = "";
        try {
          for (let step = 0; step < AGENT_MAX_STEPS; step++) {
            let stepText = "";
            let calls: AgentToolCall[] = [];
            for await (const chunk of streamAgentCompletion(
              convoMessages,
              AGENT_TOOL_DEFS,
              { maxTokens, temperature: 0.4 },
            )) {
              if (chunk.type === "text") {
                stepText += chunk.value;
                acc += chunk.value;
                send({ type: "delta", expertId: e.id, text: chunk.value });
              } else {
                calls = chunk.calls;
              }
            }

            if (calls.length === 0) break; // plain answer — done

            convoMessages.push({
              role: "assistant",
              content: stepText || null,
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: c.arguments },
              })),
            });

            let halt = false;
            for (const call of calls) {
              const tool = AGENT_TOOL_BY_NAME[call.name];
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(call.arguments || "{}");
              } catch {
                args = {};
              }

              if (!tool) {
                convoMessages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: "Unknown tool.",
                });
                continue;
              }

              if (tool.kind === "read") {
                let result: string;
                try {
                  result = await tool.run(args, toolCtx);
                } catch (err) {
                  console.error(`[messages] tool ${call.name} failed:`, err);
                  result = "That lookup failed.";
                }
                convoMessages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: result,
                });
              } else if (tool.kind === "action") {
                // Action tools mutate immediately. Emit any Undo affordance to the
                // client, feed the summary back so the model narrates the result,
                // and keep the loop going (no confirm card to wait on).
                let result;
                try {
                  result = await tool.run(args, toolCtx);
                } catch (err) {
                  console.error(`[messages] action ${call.name} failed:`, err);
                  convoMessages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    content: "That action couldn't be completed.",
                  });
                  continue;
                }
                if (result.undo) {
                  send({
                    type: "action",
                    expertId: e.id,
                    callId: call.id,
                    name: call.name,
                    undo: result.undo,
                  });
                }
                convoMessages.push({
                  role: "tool",
                  tool_call_id: call.id,
                  content: result.summary,
                });
              } else {
                // Write tool: don't persist — hand a proposal to the client to
                // confirm. The loop ends here; nothing more to stream this turn.
                try {
                  const proposal = await tool.prepare(args, toolCtx);
                  send({
                    type: "tool_call",
                    expertId: e.id,
                    callId: call.id,
                    name: call.name,
                    proposal,
                  });
                } catch (err) {
                  console.error(`[messages] prepare ${call.name} failed:`, err);
                  const note =
                    "\n\n_(I couldn't prepare that log — use the Log it button to enter it.)_";
                  acc += note;
                  send({ type: "delta", expertId: e.id, text: note });
                }
                halt = true;
              }
            }

            if (halt) break;
          }
        } catch (err) {
          console.error(`[conversations/messages] agent ${e.id} failed:`, err);
          if (!acc) {
            send({
              type: "error",
              expertId: e.id,
              message: "This assistant is unavailable right now.",
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
        const replyTasks = agentic
          ? [runAgent(experts[0])]
          : experts.map(runExpert);
        await Promise.all([...replyTasks, titleTask()]);
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
