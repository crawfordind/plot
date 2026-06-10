import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authenticateUser, createSession } from "@/lib/auth";
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

    await createSession(user.id);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof ZodError) {
      return handleZodError(error);
    }
    return jsonError("Login failed", 500);
  }
}
