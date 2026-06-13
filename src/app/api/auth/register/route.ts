import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createSession, createUser } from "@/lib/auth";
import { handleZodError, jsonError } from "@/lib/api";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);
    const user = await createUser(data.email, data.password, data.name);
    await createSession(user.id, user.orgId);

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
    }
    if (error instanceof Error && error.message === "Email already registered") {
      return jsonError(error.message, 409);
    }
    return jsonError("Registration failed", 500);
  }
}
