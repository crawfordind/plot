import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const SESSION_COOKIE = "plot_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createUser(email: string, password: string, name?: string) {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (existing) {
    throw new Error("Email already registered");
  }

  const id = nanoid();
  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    id,
    email: email.toLowerCase(),
    name: name ?? null,
    passwordHash,
  });

  return { id, email: email.toLowerCase(), name: name ?? null };
}

export async function authenticateUser(email: string, password: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}

export async function createSession(userId: string) {
  const sessionId = nanoid();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  return sessionId;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionId) {
    return null;
  }

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    with: {
      user: true,
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}
