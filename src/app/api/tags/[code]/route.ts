import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { tags } from "@/db/schema";
import { handleApiError, jsonError, requireOrg } from "@/lib/api";
import { parseTagCode } from "@/lib/tags/code";
import { nearbyCandidates, resolveTag } from "@/lib/tags/resolve";
import { getOwnedTagByCode } from "@/lib/ownership";
import { serializeTag } from "@/lib/serializers";
import { updateTagSchema } from "@/lib/validators";

type Params = { params: Promise<{ code: string }> };

// Resolve a scan. On a miss this is deliberately NOT a bare 404: it returns the
// records within ~10 m of the phone so the client can offer "match to a nearby
// record" instead of a dead end. `lat`/`lng` are the fix at the moment of the
// scan; without them there is nothing to rank against and the list comes back
// empty.
export async function GET(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { code: raw } = await params;
  const code = parseTagCode(raw);
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const hasFix = Number.isFinite(lat) && Number.isFinite(lng);

  try {
    const resolution = code ? await resolveTag(code, org.id) : null;
    if (resolution) return NextResponse.json(resolution);

    return NextResponse.json(
      {
        error: "That tag isn't in this workspace",
        code: "tag_unknown",
        tagCode: code ?? raw,
        nearby: hasFix ? await nearbyCandidates(org.id, lng, lat) : [],
      },
      { status: 404 },
    );
  } catch (error) {
    return handleApiError(error, "resolve tag");
  }
}

// Change a tag's own state — mark it lost, retire it, widen its scope. Never
// used to re-point a tag at a different record; that is /rebind, which is
// manager-gated and writes the alias chain.
export async function PATCH(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { code: raw } = await params;
  const code = parseTagCode(raw);
  if (!code) return jsonError("Invalid tag code", 400);

  try {
    const data = updateTagSchema.parse(await request.json());
    const tag = await getOwnedTagByCode(code, org.id);
    if (!tag) return jsonError("That tag isn't in this workspace", 404);

    await db
      .update(tags)
      .set({
        ...(data.status ? { status: data.status } : {}),
        ...(data.scope ? { scope: data.scope } : {}),
        ...(data.kind ? { kind: data.kind } : {}),
        ...(data.plantingId !== undefined ? { plantingId: data.plantingId } : {}),
      })
      .where(eq(tags.id, tag.id));

    const updated = await db.query.tags.findFirst({ where: eq(tags.id, tag.id) });
    return NextResponse.json({ tag: serializeTag(updated!) });
  } catch (error) {
    return handleApiError(error, "update tag");
  }
}
