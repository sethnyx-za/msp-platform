import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { emailConfigs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { testSmtpConnection, testImapConnection } from "@/lib/services/email-config"

const testSchema = z.object({
  type: z.enum(["smtp", "imap"]),
})

// POST /api/admin/settings/email/test
export async function POST(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = testSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const [config] = await db.select({ id: emailConfigs.id }).from(emailConfigs).limit(1)
  if (!config) return NextResponse.json({ ok: false, error: "No email config found. Save settings first." })

  const result = parsed.data.type === "smtp"
    ? await testSmtpConnection(config.id)
    : await testImapConnection(config.id)

  // Persist test result
  await db
    .update(emailConfigs)
    .set({
      lastTestedAt: new Date(),
      lastTestSuccess: result.ok,
      lastTestError: result.ok ? null : (result.error ?? "Unknown error"),
      updatedAt: new Date(),
    })
    .where(eq(emailConfigs.id, config.id))

  return NextResponse.json(result)
}
