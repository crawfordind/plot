import { prepareForVision } from "@/lib/attachments/imagePrep";
import { visionCompletion } from "@/lib/openrouter";

// Turns a user's chat upload into text the experts can reason over. Images get a
// short vision "read"; text documents (PDF/CSV/TXT) get their text extracted.
// Everything is capped so a big upload can't blow up the prompt (and cost).

// Per-document character cap. ~8k chars ≈ a few pages — enough to be useful as
// context without dominating the prompt. Longer docs are truncated with a note.
const MAX_DOC_CHARS = 8_000;

type AttachmentForContext = {
  fileName: string;
  kind: "image" | "document";
  extractedText: string | null;
  visionSummary: string | null;
};

// Pull readable text out of a document. PDFs go through unpdf (serverless-safe,
// no native deps); text/* and CSV are decoded as UTF-8. Returns "" for formats we
// can't read here (e.g. .docx — a future addition via a docx parser). Never
// throws: extraction is best-effort enrichment.
export async function extractDocText(bytes: Buffer, mime: string): Promise<string> {
  try {
    if (mime === "application/pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      // mergePages joins every page into a single string.
      const { text } = await extractText(pdf, { mergePages: true });
      return cap(text);
    }
    if (mime.startsWith("text/") || mime === "application/csv") {
      return cap(new TextDecoder().decode(bytes));
    }
    // docx / xlsx / etc. would slot in here with a dedicated parser.
    return "";
  } catch {
    return "";
  }
}

// One-paragraph plain-language read of an image, for use as chat context. Reuses
// the same vision prep (downscale + reference grid) as photo insights, but asks
// for a single free-text summary rather than the full structured insight.
export async function summarizeImage(bytes: Buffer): Promise<string> {
  const prepared = await prepareForVision(bytes);
  const raw = await visionCompletion([
    {
      role: "system",
      content:
        "You describe a photo a farmer attached to a chat so an advisor can use it. " +
        "Return a JSON object {\"summary\":\"...\"} where summary is 2–4 sentences of " +
        "concrete, useful observations (what it shows, condition, anything notable). " +
        "No preamble.",
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Describe this photo for a farm advisor." },
        { type: "image_url", image_url: { url: prepared.dataUrl } },
      ],
    },
  ]);

  try {
    const parsed = JSON.parse(raw) as { summary?: unknown };
    if (typeof parsed.summary === "string" && parsed.summary.trim()) {
      return parsed.summary.trim();
    }
  } catch {
    // Model didn't return clean JSON — fall back to the raw text.
  }
  return raw.trim();
}

// Assemble the "ATTACHED FILES" block appended to the expert system prompt for a
// turn. Empty string when nothing usable was attached.
export function buildAttachmentBlock(items: AttachmentForContext[]): string {
  const lines = items
    .map((a) => {
      const body = a.kind === "image" ? a.visionSummary : a.extractedText;
      if (!body || !body.trim()) return "";
      const label = a.kind === "image" ? "Image" : "Document";
      return `### ${label}: ${a.fileName}\n${body.trim()}`;
    })
    .filter(Boolean);

  if (!lines.length) return "";
  return [
    "=== ATTACHED FILES (uploaded by the farmer for this question) ===",
    lines.join("\n\n"),
  ].join("\n");
}

function cap(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_DOC_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_DOC_CHARS)}\n…(truncated)`;
}
