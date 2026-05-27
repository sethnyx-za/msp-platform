import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { emailConfigs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { encrypt, decryptNullable } from "@/lib/encryption"
import { clearEmailConfigCache } from "@/lib/services/email-config"

const upsertSchema = z.object({
  provider: z.enum(["smtp", "zoho", "gmail", "m365"]).default("smtp"),
  // SMTP fields
  smtpHost: z.string().max(255).nullable().optional(),
  smtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  smtpUser: z.string().max(255).nullable().optional(),
  smtpPassword: z.string().max(500).optional(),  // plain-text, we encrypt before saving
  smtpSecure: z.boolean().nullable().optional(),
  fromName: z.string().max(255).nullable().optional(),
  fromAddress: z.string().email().max(255).nullable().optional(),
  // OAuth2 fields (gmail / m365)
  oauthClientId: z.string().max(255).nullable().optional(),
  oauthClientSecret: z.string().max(500).optional(),
  oauthRefreshToken: z.string().max(1000).optional(),
  oauthTenantId: z.string().max(255).nullable().optional(),
  // IMAP fields
  imapHost: z.string().max(255).nullable().optional(),
  imapPort: z.number().int().min(1).max(65535).nullable().optional(),
  imapUser: z.string().max(255).nullable().optional(),
  imapPassword: z.string().max(500).optional(),
  imapTls: z.boolean().nullable().optional(),
  imapMailbox: z.string().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
})

// GET /api/admin/settings/email — returns config (never returns plaintext secrets)
export async function GET(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [config] = await db.select().from(emailConfigs).limit(1)
  if (!config) return NextResponse.json({ data: null })

  // Strip encrypted fields — return only safe metadata
  const safe = {
    id: config.id,
    provider: config.provider,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUser: config.smtpUser,
    smtpPasswordSet: !!config.smtpPasswordEncrypted,
    smtpSecure: config.smtpSecure,
    fromName: config.fromName,
    fromAddress: config.fromAddress,
    oauthClientId: config.oauthClientId,
    oauthClientSecretSet: !!config.oauthClientSecretEncrypted,
    oauthRefreshTokenSet: !!config.oauthRefreshTokenEncrypted,
    oauthTenantId: config.oauthTenantId,
    imapHost: config.imapHost,
    imapPort: config.imapPort,
    imapUser: config.imapUser,
    imapPasswordSet: !!config.imapPasswordEncrypted,
    imapTls: config.imapTls,
    imapMailbox: config.imapMailbox,
    isActive: config.isActive,
    lastTestedAt: config.lastTestedAt,
    lastTestSuccess: config.lastTestSuccess,
    lastTestError: config.lastTestError,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }

  return NextResponse.json({ data: safe })
}

// PUT /api/admin/settings/email — upsert (there is only one config row)
export async function PUT(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const d = parsed.data

  // Build DB values — encrypt secrets
  const values: Record<string, unknown> = {
    provider: d.provider,
    smtpHost: d.smtpHost ?? null,
    smtpPort: d.smtpPort ?? null,
    smtpUser: d.smtpUser ?? null,
    smtpSecure: d.smtpSecure ?? null,
    fromName: d.fromName ?? null,
    fromAddress: d.fromAddress ?? null,
    oauthClientId: d.oauthClientId ?? null,
    oauthTenantId: d.oauthTenantId ?? null,
    imapHost: d.imapHost ?? null,
    imapPort: d.imapPort ?? null,
    imapUser: d.imapUser ?? null,
    imapTls: d.imapTls ?? null,
    imapMailbox: d.imapMailbox ?? "INBOX",
    isActive: d.isActive ?? true,
    updatedAt: new Date(),
  }

  if (d.smtpPassword) values.smtpPasswordEncrypted = encrypt(d.smtpPassword)
  if (d.oauthClientSecret) values.oauthClientSecretEncrypted = encrypt(d.oauthClientSecret)
  if (d.oauthRefreshToken) values.oauthRefreshTokenEncrypted = encrypt(d.oauthRefreshToken)
  if (d.imapPassword) values.imapPasswordEncrypted = encrypt(d.imapPassword)

  // Upsert: check if any row exists
  const [existing] = await db.select({ id: emailConfigs.id }).from(emailConfigs).limit(1)

  let result
  if (existing) {
    ;[result] = await db
      .update(emailConfigs)
      .set(values)
      .where(eq(emailConfigs.id, existing.id))
      .returning({ id: emailConfigs.id, provider: emailConfigs.provider, isActive: emailConfigs.isActive })
  } else {
    ;[result] = await db
      .insert(emailConfigs)
      .values(values)
      .returning({ id: emailConfigs.id, provider: emailConfigs.provider, isActive: emailConfigs.isActive })
  }

  clearEmailConfigCache()
  return NextResponse.json({ data: result })
}
