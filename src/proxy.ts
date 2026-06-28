import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("plot_session")?.value;
  const isPublic = publicPaths.some((path) => pathname.startsWith(path));
  const isApi = pathname.startsWith("/api");

  if (!session && !isPublic && !isApi) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session && isPublic) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
