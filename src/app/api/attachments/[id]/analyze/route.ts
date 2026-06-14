import { NextResponse } from "next/server";
import { jsonError, requireOrg } from "@/lib/api";
import { NotAnalyzableError, analyzeAttachment } from "@/lib/photoInsights/analyze";

type Params = { params: Promise<{ id: string }> };

// Run (or re-run) the vision analysis for one image attachment. Called
// automatically right after upload, and again when a user edits a photo's context.
export async function POST(_request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;

  try {
    const insight = await analyzeAttachment(id, org.id);
    return NextResponse.json({ insight });
  } catch (error) {
    if (error instanceof NotAnalyzableError) {
      return jsonError(error.message, 422);
    }
    if (error instanceof SyntaxError) {
      return jsonError("Couldn't parse the model response", 502);
    }
    if (error instanceof Error) {
      if (error.message.includes("OPENROUTER_API_KEY")) {
        return jsonError(
          "Photo analysis isn't configured. Add OPENROUTER_API_KEY.",
          503,
        );
      }
      // Native image library (sharp/libvips) failed to load on the host. The
      // photo itself uploaded fine — only the AI read couldn't run.
      if (
        /sharp|libvips|ERR_DLOPEN/i.test(error.message) ||
        error.message.includes("Could not load")
      ) {
        console.error("[api] sharp/libvips failed to load during analysis:", error);
        return jsonError(
          "Photo analysis is temporarily unavailable on the server. Your photo was saved.",
          503,
        );
      }
      return jsonError(error.message, 502);
    }
    return jsonError("Analysis failed", 500);
  }
}
