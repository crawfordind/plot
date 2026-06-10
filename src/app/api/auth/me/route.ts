import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }
  return NextResponse.json({ user });
}
