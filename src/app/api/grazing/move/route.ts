import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { handleApiError, handleZodError, jsonError, requireOrg } from "@/lib/api";
import { applyHerdMove, HerdMoveError } from "@/lib/grazing/move";
import { grazingMoveSchema } from "@/lib/validators";

// Apply a herd move: close the herd's current open grazing period (recording the
// move-off height) and open a new one on the target paddock. The transaction and
// validation live in applyHerdMove so the agent's move_herd tool shares them.
export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const data = grazingMoveSchema.parse(body);

    const { opened, closed } = await applyHerdMove({
      orgId: org.id,
      userId: user.id,
      ...data,
    });

    // 201 when a new period was opened (moved onto a paddock); 200 for a move
    // OFF pasture, which only closes the open period.
    return NextResponse.json({ opened, closed }, { status: opened ? 201 : 200 });
  } catch (error) {
    if (error instanceof HerdMoveError) return jsonError(error.message, error.status);
    if (error instanceof ZodError) return handleZodError(error);
    return handleApiError(error, "record move");
  }
}
