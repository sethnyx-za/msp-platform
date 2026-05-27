import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getRequiredRole, hasMinRole } from "@/lib/auth/rbac"
import type { UserRole } from "@/types"

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/_next", "/favicon.ico"]

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // ── Allow public paths ────────────────────────────────────────────────────
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    // Redirect authenticated users away from login
    if (pathname === "/login" && session?.user) {
      const dest = session.user.isMspStaff ? "/admin" : "/dashboard"
      return NextResponse.redirect(new URL(dest, req.url))
    }
    return NextResponse.next()
  }

  // ── Require authentication ────────────────────────────────────────────────
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── Check revoked sessions (force-logout) ─────────────────────────────────
  // Note: Redis is not available in Edge runtime. We rely on short JWT maxAge
  // (8h) + the /api/auth/session-check endpoint for active revocation.
  // If you need instant revocation, switch to database sessions.

  // ── Root redirect ─────────────────────────────────────────────────────────
  if (pathname === "/") {
    const dest = session.user.isMspStaff ? "/admin" : "/dashboard"
    return NextResponse.redirect(new URL(dest, req.url))
  }

  // ── MSP-only routes: block client users ───────────────────────────────────
  if (pathname.startsWith("/admin") && !session.user.isMspStaff) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  // ── Role-based route protection ───────────────────────────────────────────
  const requiredRole = getRequiredRole(pathname)
  if (requiredRole) {
    const userRole = session.user.role as UserRole
    if (!hasMinRole(userRole, requiredRole)) {
      return NextResponse.redirect(new URL("/dashboard?error=forbidden", req.url))
    }
  }

  // ── Forward user context to API routes via headers ────────────────────────
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-user-id", session.user.id)
  requestHeaders.set("x-user-email", session.user.email)
  requestHeaders.set("x-user-role", session.user.role)
  requestHeaders.set("x-org-id", session.user.organizationId)
  requestHeaders.set("x-is-msp-staff", String(session.user.isMspStaff))

  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
