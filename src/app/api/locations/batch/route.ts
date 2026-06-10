import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { handleZodError, jsonError, requireUser } from "@/lib/api";
import { serializeLocation } from "@/lib/serializers";
import { createLocationsBatchSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response!;

  try {
    const body = await request.json();
    const { nodes } = createLocationsBatchSchema.parse(body);

    // Map client tempIds to generated ids. Parents must appear before children;
    // we validate that here rather than trusting input order silently.
    const idByTemp = new Map<string, string>();
    for (const node of nodes) {
      idByTemp.set(node.tempId, nanoid());
    }

    const values = nodes.map((node) => {
      let parentId: string | null = null;
      if (node.parentTempId) {
        const resolved = idByTemp.get(node.parentTempId);
        if (!resolved) {
          throw new Error(`Unknown parent reference: ${node.parentTempId}`);
        }
        parentId = resolved;
      }
      return {
        id: idByTemp.get(node.tempId)!,
        userId: user.id,
        name: node.name,
        type: node.type,
        parentId,
        geometry: JSON.stringify(node.geometry),
        zone: node.zone ?? null,
      };
    });

    await db.insert(locations).values(values);

    const ids = values.map((v) => v.id);
    const rows = await db.query.locations.findMany({
      where: eq(locations.userId, user.id),
    });
    const created = rows
      .filter((row) => ids.includes(row.id))
      .map(serializeLocation);

    return NextResponse.json({ locations: created, count: created.length }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
    }
    if (error instanceof Error && error.message.startsWith("Unknown parent")) {
      return jsonError(error.message, 400);
    }
    return jsonError("Failed to create structure", 500);
  }
}
