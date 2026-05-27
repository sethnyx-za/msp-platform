import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { catalogItems } from "@/lib/db/schema"
import { eq, ilike, or, sql, desc } from "drizzle-orm"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  sku: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  supplier: z.string().max(255).nullable().optional(),
  unitPrice: z.coerce.number().min(0),
  currency: z.string().length(3).default("ZAR"),
})

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") ?? undefined
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200)
  const offset = (page - 1) * limit
  const activeOnly = searchParams.get("active") !== "false"

  const conditions = []
  if (search) {
    conditions.push(
      or(
        ilike(catalogItems.name, `%${search}%`),
        ilike(catalogItems.sku, `%${search}%`),
        ilike(catalogItems.category, `%${search}%`),
        ilike(catalogItems.supplier, `%${search}%`)
      )
    )
  }
  if (activeOnly) conditions.push(eq(catalogItems.isActive, true))

  const { and } = await import("drizzle-orm")
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, countResult] = await Promise.all([
    db.select().from(catalogItems).where(where).orderBy(catalogItems.category, catalogItems.name).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(catalogItems).where(where),
  ])

  return NextResponse.json({
    success: true,
    data: rows,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
  })
}

export async function POST(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const [item] = await db
    .insert(catalogItems)
    .values({
      ...parsed.data,
      unitPrice: String(parsed.data.unitPrice),
      description: parsed.data.description ?? null,
      sku: parsed.data.sku ?? null,
      category: parsed.data.category ?? null,
      supplier: parsed.data.supplier ?? null,
      isActive: true,
    })
    .returning()

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.SETTINGS_UPDATE,
    resourceType: "catalog_item",
    resourceId: item.id,
    newValue: { name: item.name, sku: item.sku },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true, data: item }, { status: 201 })
}
