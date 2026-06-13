import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  acceptPendingInvites,
  authenticateUser,
  createSession,
  getMembershipsForUser,
} from "@/lib/auth";
import { handleZodError, jsonError } from "@/lib/api";
import { loginSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = loginSchema.parse(body);
    const user = await authenticateUser(data.email, data.password);

    if (!user) {
      return jsonError("Invalid email or password", 401);
    }

    // Pull in any team invites sent to this email, then land in a workspace.
    await acceptPendingInvites(user.id, user.email);
    const memberships = await getMembershipsForUser(user.id);
    await createSession(user.id, memberships[0]?.orgId ?? null);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
    }
    return jsonError("Login failed", 500);
  }
}
