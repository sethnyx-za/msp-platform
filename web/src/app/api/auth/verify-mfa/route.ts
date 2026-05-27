/**
 * POST /api/auth/verify-mfa
 *
 * Step 2 of the MFA login flow.
 * Receives the mfaPendingKey + 6-digit TOTP code.
 * Verifies TOTP, then creates a one-time mfaBypassKey for NextAuth signIn.
 */
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { redis, RedisKeys } from "@/lib/redis"
import { verifyTotpCodeEncrypted } from "@/lib/auth/totp"
import { nanoid } from "nanoid"
import { writeAuditLog, AuditAction } from "@/lib/audit"

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown"

  let body: { pendingKey?: string; code?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { pendingKey, code } = body

  if (!pendingKey || !code) {
    return NextResponse.json({ error: "Missing pendingKey or code" }, { status: 400 })
  }

  // ── Look up pending MFA state ─────────────────────────────────────────────
  const userId = await redis.get(RedisKeys.mfaPending(pendingKey))
  if (!userId) {
    return NextResponse.json(
      { error: "MFA session expired. Please log in again." },
      { status: 401 }
    )
  }

  // ── Load user ─────────────────────────────────────────────────────────────
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })

  if (!user || !user.totpSecret) {
    return NextResponse.json({ error: "User not found" }, { status: 401 })
  }

  // ── Verify TOTP code ──────────────────────────────────────────────────────
  const valid = verifyTotpCodeEncrypted(code.replace(/\s/g, ""), user.totpSecret)

  if (!valid) {
    await writeAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: AuditAction.USER_LOGIN_FAILED,
      ipAddress: ip,
      metadata: { reason: "invalid_totp" },
    })
    return NextResponse.json({ error: "Invalid authenticator code" }, { status: 401 })
  }

  // ── Invalidate pending key (one-time use) ─────────────────────────────────
  await redis.del(RedisKeys.mfaPending(pendingKey))

  // ── Create bypass key for NextAuth signIn ─────────────────────────────────
  const bypassKey = nanoid(32)
  await redis.setex(RedisKeys.mfaBypass(bypassKey), 120, user.id) // 2 min TTL

  await writeAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: AuditAction.USER_LOGIN,
    ipAddress: ip,
    metadata: { method: "totp" },
  })

  return NextResponse.json({ bypassKey })
}
