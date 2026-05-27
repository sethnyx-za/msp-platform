/**
 * POST /api/auth/login
 *
 * Step 1 of the custom login flow.
 * Validates email + password, checks rate limits, then:
 *   - No MFA: creates a mfaBypassKey in Redis → client calls NextAuth signIn
 *   - MFA enabled: creates a mfaPendingKey in Redis → client redirects to /verify-mfa
 */
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { redis, RedisKeys } from "@/lib/redis"
import { nanoid } from "nanoid"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5)
const LOCKOUT_SECONDS = Number(process.env.LOGIN_LOCKOUT_SECONDS ?? 900)

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown"

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { email, password } = body

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const rateLimitKey = RedisKeys.loginAttempts(`${ip}:${normalizedEmail}`)
  const attempts = await redis.incr(rateLimitKey)
  if (attempts === 1) {
    // Set expiry on first attempt
    await redis.expire(rateLimitKey, LOCKOUT_SECONDS)
  }

  if (attempts > MAX_ATTEMPTS) {
    const ttl = await redis.ttl(rateLimitKey)
    return NextResponse.json(
      {
        error: "Too many login attempts. Please try again later.",
        retryAfterSeconds: ttl,
      },
      { status: 429 }
    )
  }

  // ── Load user ─────────────────────────────────────────────────────────────
  const user = await db.query.users.findFirst({
    where: and(eq(users.email, normalizedEmail), eq(users.isActive, true)),
  })

  // Always hash-compare to prevent timing attacks
  const passwordHash = user?.passwordHash ?? "$2b$12$invalid.hash.to.prevent.timing.attacks"
  const passwordValid = await bcrypt.compare(password, passwordHash)

  if (!user || !passwordValid) {
    await writeAuditLog({
      userEmail: normalizedEmail,
      action: AuditAction.USER_LOGIN_FAILED,
      ipAddress: ip,
      metadata: { reason: "invalid_credentials" },
    })
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  // ── Clear rate limit on successful verification ───────────────────────────
  await redis.del(rateLimitKey)

  // ── Check MFA ─────────────────────────────────────────────────────────────
  if (user.totpEnabled && user.totpSecret) {
    // Store pending MFA state — user must verify TOTP next
    const pendingKey = nanoid(32)
    await redis.setex(RedisKeys.mfaPending(pendingKey), 300, user.id) // 5 min TTL

    return NextResponse.json({
      requiresMfa: true,
      pendingKey,
    })
  }

  // ── No MFA — create bypass key for NextAuth signIn ────────────────────────
  const bypassKey = nanoid(32)
  await redis.setex(RedisKeys.mfaBypass(bypassKey), 120, user.id) // 2 min TTL

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: AuditAction.USER_LOGIN,
    ipAddress: ip,
    metadata: { method: "password" },
  })

  return NextResponse.json({
    requiresMfa: false,
    bypassKey,
  })
}
