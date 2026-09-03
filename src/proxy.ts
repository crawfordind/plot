import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Reachable without a session. `/welcome` is the marketing landing page.
const publicPaths = ["/login", "/register", "/welcome"];
// Auth pages a signed-in user should be bounced away from (not the landing page).
const authPaths = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("plot_session")?.value;
  const isPublic = publicPaths.some((path) => pathname.startsWith(path));
  const isAuth = authPaths.some((path) => pathname.startsWith(path));
  const isApi = pathname.startsWith("/api");
  // The root is the public homepage: it renders the marketing landing for
  // anonymous visitors and the app for signed-in users (see src/app/page.tsx).
  const isRoot = pathname === "/";

  if (!session && !isPublic && !isApi && !isRoot) {
    // Carry the intended destination through sign-in so the user lands where
    // they were going. This is what makes a scanned tag work on a phone that
    // isn't signed in: the tag's URL survives the detour and the crew comes back
    // to the tube they're standing at, rather than the map's home view.
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  if (session && isAuth) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
