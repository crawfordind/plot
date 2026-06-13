import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { attachments, photoInsights } from "@/db/schema";
import { prepareForVision } from "@/lib/attachments/imagePrep";
import { readAttachmentFile } from "@/lib/attachments/storage";
import { getOwnedAttachment, getOwnedLocation } from "@/lib/ownership";
import { buildFarmContext } from "@/lib/photoInsights/farmContext";
import { buildPhotoInsightPrompt } from "@/lib/photoInsights/prompt";
import {
  PROMPT_VERSION,
  normalizePhotoInsight,
} from "@/lib/photoInsights/schema";
import { serializePhotoInsight } from "@/lib/serializers";
import { visionCompletion } from "@/lib/openrouter";

const DEFAULT_VISION_MODEL = "google/gemini-2.5-flash-lite";

export class NotAnalyzableError extends Error {}

function resolveModel(): string {
  return (
    process.env.OPENROUTER_VISION_MODEL ??
    process.env.OPENROUTER_MODEL ??
    DEFAULT_VISION_MODEL
  );
}

// Run the vision LLM over one image attachment and persist a structured insight.
// Idempotent per attachment: re-running replaces the existing insight row (so a
// user can add context and re-analyze). Throws NotAnalyzableError for non-images.
export async function analyzeAttachment(attachmentId: string, orgId: string) {
  const attachment = await getOwnedAttachment(attachmentId, orgId);
  if (!attachment) throw new NotAnalyzableError("Attachment not found");
  if (attachment.kind !== "image") {
    throw new NotAnalyzableError("Only images can be analyzed");
  }

  await db
    .update(attachments)
    .set({ analysisStatus: "processing" })
    .where(eq(attachments.id, attachmentId));

  try {
    const location = await getOwnedLocation(attachment.locationId, orgId);
    if (!location) throw new NotAnalyzableError("Location not found");

    const bytes = await readAttachmentFile(attachment.storedName);
    const [prepared, farmContext] = await Promise.all([
      prepareForVision(bytes),
      buildFarmContext(location, orgId),
    ]);

    const systemPrompt = buildPhotoInsightPrompt({
      farmContext,
      source: attachment.source,
      lat: attachment.lat,
      lng: attachment.lng,
      heading: attachment.heading,
      placeLabel: attachment.placeLabel,
      capturedAt: attachment.capturedAt,
      userContext: attachment.userContext,
    });

    const model = resolveModel();
    const rawText = await visionCompletion([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this farm photo." },
          { type: "image_url", image_url: { url: prepared.dataUrl } },
        ],
      },
    ]);

    const parsed = normalizePhotoInsight(JSON.parse(rawText));

    const id = nanoid();
    const values = {
      id,
      orgId,
      attachmentId,
      model,
      promptVersion: PROMPT_VERSION,
      summary: parsed.summary,
      subjectType: parsed.subjectType,
      tags: JSON.stringify(parsed.tags),
      observations: JSON.stringify(parsed.observations),
      raw: rawText,
      confidence: parsed.confidence,
    };
    await db
      .insert(photoInsights)
      .values(values)
      .onConflictDoUpdate({
        target: photoInsights.attachmentId,
        set: {
          model: values.model,
          promptVersion: values.promptVersion,
          summary: values.summary,
          subjectType: values.subjectType,
          tags: values.tags,
          observations: values.observations,
          raw: values.raw,
          confidence: values.confidence,
        },
      });

    await db
      .update(attachments)
      .set({ analysisStatus: "done" })
      .where(eq(attachments.id, attachmentId));

    const row = await db.query.photoInsights.findFirst({
      where: eq(photoInsights.attachmentId, attachmentId),
    });
    return serializePhotoInsight(row!);
  } catch (error) {
    await db
      .update(attachments)
      .set({ analysisStatus: "failed" })
      .where(eq(attachments.id, attachmentId));
    throw error;
  }
}
