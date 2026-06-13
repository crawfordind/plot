import { GRID_SPEC } from "@/lib/attachments/imagePrep";

export type PhotoPromptContext = {
  farmContext: string;
  source: "asset_camera" | "live_camera" | "upload";
  lat: number | null;
  lng: number | null;
  heading: number | null;
  placeLabel: string | null;
  capturedAt: Date | null;
  userContext: string | null;
};

// Compass bearing → cardinal direction, for a more legible "facing" cue.
function cardinal(heading: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(heading / 45) % 8];
}

export function buildPhotoInsightPrompt(ctx: PhotoPromptContext): string {
  const geo: string[] = [];
  if (ctx.lat !== null && ctx.lng !== null) {
    geo.push(`GPS: ${ctx.lat.toFixed(6)}, ${ctx.lng.toFixed(6)}`);
  }
  if (ctx.placeLabel) geo.push(`Place: ${ctx.placeLabel}`);
  if (ctx.heading !== null) {
    geo.push(
      `Camera facing: ${Math.round(ctx.heading)}° (${cardinal(ctx.heading)})`,
    );
  }
  if (ctx.capturedAt) geo.push(`Taken: ${ctx.capturedAt.toISOString()}`);

  const sourceNote =
    ctx.source === "upload"
      ? "This photo was uploaded from the user's library, so it may not depict their current location — weigh the user's context heavily."
      : ctx.source === "live_camera"
        ? "This photo was just taken in the field; GPS reflects where the user is standing."
        : "This photo was taken in-app from a specific farm asset; it depicts that asset.";

  return `You are a field agronomist and plant & soil scientist analysing a single farm photo for a working grower. Be precise, practical, and grounded only in what is visible plus the context given. Do not invent details you cannot see. If the image is unclear or off-topic, say so and lower your confidence.

${GRID_SPEC.description}

${sourceNote}

${geo.length > 0 ? `Capture metadata:\n${geo.join("\n")}\n` : ""}
Farm context (what's around this spot):
${ctx.farmContext || "(no additional context on file yet)"}

${ctx.userContext ? `The user added this context about the photo:\n"${ctx.userContext}"\n` : ""}
Return a SINGLE JSON object (no prose, no markdown) with exactly this shape:
{
  "summary": string,                 // one tight paragraph: what this photo shows and why it matters
  "subjectType": "crop"|"soil"|"pest_disease"|"weed"|"livestock"|"equipment"|"infrastructure"|"water"|"landscape"|"other",
  "tags": string[],                  // 3–8 short lowercase tags for search/grouping
  "confidence": number,              // 0–1, your confidence in this read
  "observations": {
    "subject": string|null,          // the crop/animal/object in frame
    "growthStage": string|null,      // phenological/maturity stage if applicable
    "healthAssessment": string|null, // vigour/health of the subject
    "soilCondition": string|null,    // surface, structure, moisture, residue, erosion cues
    "pestsOrDisease": string|null,   // symptoms of pests/disease/damage
    "weeds": string|null,            // weed pressure/species if visible
    "gridNotes": string|null,        // cite grid cells, e.g. "yellowing in C3–D4"
    "recommendations": string[],     // concrete next steps for the grower
    "concerns": string[]             // flags worth a human's attention
  }
}

Rules:
- Use the reference grid in "gridNotes" and "summary" when location within the frame matters.
- Set fields to null / [] when there's nothing to say; never fabricate.
- Choose the single best "subjectType" for the dominant content.
- Keep "summary" under ~80 words.`;
}
