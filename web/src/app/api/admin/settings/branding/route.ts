import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { mspBranding } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const brandingSchema = z.object({
  companyName: z.string().min(1).max(100).optional(),
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  reportLogoUrl: z.string().url().nullable().optional(),
  reportHeaderHtml: z.string().nullable().optional(),
  reportFooterHtml: z.string().nullable().optional(),
  emailLogoUrl: z.string().url().nullable().optional(),
  emailFooterHtml: z.string().nullable().optional(),
  customCss: z.string().nullable().optional(),
})

function guardSuperAdmin(req: NextRequest) {
  const role = req.headers.get("x-user-role")
  if (req.headers.get("x-is-msp-staff") !== "true" || role !== "msp_super_admin") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const [branding] = await db.select().from(mspBranding).limit(1)
  return NextResponse.json({ success: true, data: branding ?? null })
}

export async function PUT(req: NextRequest) {
  const guard = guardSuperAdmin(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const body = await req.json().catch(() => null)
  const parsed = brandingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  // Upsert — only one branding record exists
  const [existing] = await db.select({ id: mspBranding.id }).from(mspBranding).limit(1)

  let result
  if (existing) {
    const [updated] = await db
      .update(mspBranding)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(mspBranding.id, existing.id))
      .returning()
    result = updated
  } else {
    // id omitted — PostgreSQL generates UUID via defaultRandom()
    const [created] = await db
      .insert(mspBranding)
      .values({ ...parsed.data })
      .returning()
    result = created
  }

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.SETTINGS_UPDATE,
    resourceType: "msp_branding",
    resourceId: result?.id,
    newValue: parsed.data,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true, data: result })
}
