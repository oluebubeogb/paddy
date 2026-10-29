import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "paddy_session";

/** Signed-in app pages (route group `src/app/(app)`) plus onboarding. */
const PROTECTED_PREFIXES = ["/chat", "/companion", "/life", "/memories", "/onboarding"];
/** Auth pages a signed-in user should skip. */
const GUEST_ONLY = ["/sign-in", "/sign-up", "/forgot-password"];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// Next 16 "proxy" (formerly middleware). Cookie presence is a cheap edge gate;
// every API route still validates the session against the database, and
// /api/me clears a stale cookie so this gate cannot loop.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (!token && PROTECTED_PREFIXES.some((p) => matches(pathname, p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (token && GUEST_ONLY.some((p) => matches(pathname, p))) {
    const url = req.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/chat/:path*",
    "/companion/:path*",
    "/life/:path*",
    "/memories/:path*",
    "/onboarding/:path*",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
  ],
};
