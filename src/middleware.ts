import { NextResponse, type NextRequest } from "next/server";
import { roleHome } from "@/lib/navigation";
import type { Workspace } from "@/lib/auth/types";
import { SESSION_COOKIE, verifySession } from "@/server/jwt";

/**
 * Route-level gate. Runs on the Edge runtime, so it works from the token alone:
 * is there a valid signature, and does this session's workspace list cover the
 * dashboard being opened. Fine-grained permission checks happen server-side in
 * the route handlers, where the live store is reachable.
 */

const WORKSPACE_PREFIX: Record<string, Workspace> = {
  "/client": "client",
  "/company": "company",
  "/collector": "collector",
  "/admin": "admin",
};

function workspaceFor(pathname: string): Workspace | null {
  for (const [prefix, ws] of Object.entries(WORKSPACE_PREFIX)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return ws;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySession(token) : null;

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));

  // Signed in, "/" is resolved by the home page, which knows the permissions and
  // so can send staff to their own dashboard; the token alone can't.
  if (pathname === "/login") {
    return claims ? redirectTo("/") : NextResponse.next();
  }

  if (pathname === "/") {
    return claims ? NextResponse.next() : redirectTo("/login");
  }

  const required = workspaceFor(pathname);
  if (!required) return NextResponse.next();

  if (!claims) {
    const next = encodeURIComponent(pathname + search);
    return redirectTo(`/login?next=${next}`);
  }

  // Held until two-step sign-in is set up: only their security page opens.
  if (claims.setup && pathname !== `/${claims.ws}/security`) {
    return redirectTo(`/${claims.ws}/security`);
  }

  // Signed in, but this dashboard is not theirs — send them to their own.
  const allowed = claims.allowed?.length ? claims.allowed : [claims.ws];
  if (!allowed.includes(required)) {
    return redirectTo(roleHome(claims.ws));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals, the auth API and static files.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$|.*\\.webp$).*)",
  ],
};
