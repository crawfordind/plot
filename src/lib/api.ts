import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleZodError(error: ZodError) {
  const message = error.issues.map((issue) => issue.message).join(", ");
  return jsonError(message);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: jsonError("Unauthorized", 401) };
  }
  return { user, response: null };
}
