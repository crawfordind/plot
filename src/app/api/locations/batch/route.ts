import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { serializeLocation } from "@/lib/serializers";
import { createLocationsBatchSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const { user, org, response } = await requireOrg();
  if (!org) return response!;

  try {
    const body = await request.json();
    const { nodes } = createLocationsBatchSchema.parse(body);

    // Map client tempIds to generated ids. Parents must appear before children;
    // we validate that here rather than trusting input order silently.
    const idByTemp = new Map<string, string>();
    for (const node of nodes) {
      idByTemp.set(node.tempId, nanoid());
    }

    // Nodes may instead attach to an existing location via parentId; verify the
    // user owns each referenced existing parent before linking.
    const existingParentIds = Array.from(
      new Set(nodes.map((n) => n.parentId).filter((id): id is string => !!id)),
    );
    const ownedExistingParents = new Set<string>();
    for (const parentId of existingParentIds) {
      const owned = await db.query.locations.findFirst({
        where: and(eq(locations.id, parentId), eq(locations.orgId, org.id)),
      });
      if (!owned) {
        throw new Error(`Unknown parent reference: ${parentId}`);
      }
      ownedExistingParents.add(parentId);
    }

    const values = nodes.map((node) => {
      let parentId: string | null = null;
      if (node.parentTempId) {
        const resolved = idByTemp.get(node.parentTempId);
        if (!resolved) {
          throw new Error(`Unknown parent reference: ${node.parentTempId}`);
        }
        parentId = resolved;
      } else if (node.parentId) {
        if (!ownedExistingParents.has(node.parentId)) {
          throw new Error(`Unknown parent reference: ${node.parentId}`);
        }
        parentId = node.parentId;
      }
      return {
        id: idByTemp.get(node.tempId)!,
        orgId: org.id,
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
      where: eq(locations.orgId, org.id),
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
