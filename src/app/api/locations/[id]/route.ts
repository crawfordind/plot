import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { db } from "@/db";
import { attachments, locations } from "@/db/schema";
import { handleZodError, jsonError, requireOrg } from "@/lib/api";
import { deleteAttachmentFile } from "@/lib/attachments/storage";
import { getOwnedLocation } from "@/lib/ownership";
import { serializeLocation } from "@/lib/serializers";
import { updateLocationSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const row = await getOwnedLocation(id, org.id);
  if (!row) return jsonError("Location not found", 404);

  return NextResponse.json({ location: serializeLocation(row) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const existing = await getOwnedLocation(id, org.id);
  if (!existing) return jsonError("Location not found", 404);

  try {
    const body = await request.json();
    const data = updateLocationSchema.parse(body);

    // Re-parenting requires validation: the new parent must be owned by the
    // caller (no cross-tenant attach) and must not create a cycle (a location
    // cannot become a descendant of itself, which would orphan a whole subtree
    // and infinite-loop any tree walk).
    if (data.parentId) {
      if (data.parentId === id) {
        return jsonError("A location cannot be its own parent", 400);
      }
      const parent = await getOwnedLocation(data.parentId, org.id);
      if (!parent) return jsonError("Parent location not found", 404);

      // Walk up from the proposed parent; if we reach `id`, this would form a cycle.
      let cursor: string | null = parent.parentId;
      const guard = new Set<string>([data.parentId]);
      while (cursor) {
        if (cursor === id) {
          return jsonError("That move would nest a location inside itself", 400);
        }
        if (guard.has(cursor)) break; // defend against pre-existing bad data
        guard.add(cursor);
        const next: { parentId: string | null } | undefined =
          await db.query.locations.findFirst({
            where: and(eq(locations.id, cursor), eq(locations.orgId, org.id)),
            columns: { parentId: true },
          });
        cursor = next?.parentId ?? null;
      }
    }

    await db
      .update(locations)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.geometry !== undefined
          ? { geometry: JSON.stringify(data.geometry) }
          : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId ?? null } : {}),
        ...(data.zone !== undefined ? { zone: data.zone ?? null } : {}),
      })
      .where(eq(locations.id, id));

    const row = await getOwnedLocation(id, org.id);
    return NextResponse.json({ location: serializeLocation(row!) });
  } catch (error) {
    if (error instanceof ZodError) return handleZodError(error);
    return jsonError("Failed to update location", 500);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { org, response } = await requireOrg();
  if (!org) return response!;

  const { id } = await params;
  const existing = await getOwnedLocation(id, org.id);
  if (!existing) return jsonError("Location not found", 404);

  // Deleting a location cascades (via parentId) to its whole subtree, and that
  // removes every descendant's attachment rows — but not the files on disk. So
  // first gather the stored filenames for this location and all descendants,
  // then sweep them after the DB delete to avoid orphaned uploads.
  const owned = await db.query.locations.findMany({
    where: eq(locations.orgId, org.id),
    columns: { id: true, parentId: true },
  });
  const childrenBy = new Map<string | null, string[]>();
  for (const l of owned) {
    const arr = childrenBy.get(l.parentId) ?? [];
    arr.push(l.id);
    childrenBy.set(l.parentId, arr);
  }
  const subtree = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    for (const child of childrenBy.get(current) ?? []) {
      if (!subtree.has(child)) {
        subtree.add(child);
        stack.push(child);
      }
    }
  }

  const files = await db.query.attachments.findMany({
    where: and(
      eq(attachments.orgId, org.id),
      inArray(attachments.locationId, [...subtree]),
    ),
    columns: { storedName: true },
  });

  await db.delete(locations).where(eq(locations.id, id));
  await Promise.all(files.map((f) => deleteAttachmentFile(f.storedName)));

  return NextResponse.json({ ok: true });
}
