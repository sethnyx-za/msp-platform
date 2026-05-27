/**
 * GET  /api/auth/setup-mfa  — Generate TOTP secret + QR code for current user
 * POST /api/auth/setup-mfa  — Verify code and activate MFA
 * DELETE /api/auth/setup-mfa — Disable MFA (requires TOTP verification)
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import {
  generateTotpSecret,
  generateTotpQrCode,
  encryptTotpSecret,
  verifyTotpCode,
  decryptTotpSecret,
  verifyTotpCodeEncrypted,
} from "@/lib/auth/totp"
import { redis } from "@/lib/redis"
import { writeAuditLog, AuditAction } from "@/lib/audit"
import { nanoid } from "nanoid"

// Temp Redis key stores the raw secret until the user verifies it
const SETUP_KEY = (userId: string) => `mfa:setup:${userId}`

// GET — generate secret and return QR code
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const rawSecret = generateTotpSecret()
  const qrCode = await generateTotpQrCode(rawSecret, session.user.email)

  // Store secret temporarily (10 min) until verified
  await redis.setex(SETUP_KEY(session.user.id), 600, rawSecret)

  return NextResponse.json({ qrCode, secret: rawSecret })
}

// POST — verify the first code to confirm setup
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { code } = await req.json()
  if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 })

  // Retrieve temp secret
  const rawSecret = await redis.get(SETUP_KEY(session.user.id))
  if (!rawSecret) {
    return NextResponse.json({ error: "Setup session expired. Please start again." }, { status: 400 })
  }

  if (!verifyTotpCode(code.replace(/\s/g, ""), rawSecret)) {
    return NextResponse.json({ error: "Invalid code. Please try again." }, { status: 400 })
  }

  // Encrypt and save
  const encryptedSecret = encryptTotpSecret(rawSecret)
  await db
    .update(users)
    .set({ totpSecret: encryptedSecret, totpEnabled: true, updatedAt: new Date() })
    .where(eq(users.id, session.user.id))

  await redis.del(SETUP_KEY(session.user.id))

  await writeAuditLog({
    userId: session.user.id,
    userEmail: session.user.email,
    action: AuditAction.USER_MFA_ENABLED,
    organizationId: session.user.organizationId,
  })

  return NextResponse.json({ success: true })
}

// DELETE — disable MFA (requires current TOTP code as confirmation)
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { code } = await req.json()
  if (!code) return NextResponse.json({ error: "Current TOTP code required to disable MFA" }, { status: 400 })

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  if (!user?.totpSecret) return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 })

  if (!verifyTotpCodeEncrypted(code.replace(/\s/g, ""), user.totpSecret)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 })
  }

  await db
    .update(users)
    .set({ totpSecret: null, totpEnabled: false, updatedAt: new Date() })
    .where(eq(users.id, session.user.id))

  await writeAuditLog({
    userId: session.user.id,
    userEmail: session.user.email,
    action: AuditAction.USER_MFA_DISABLED,
    organizationId: session.user.organizationId,
  })

  return NextResponse.json({ success: true })
}
