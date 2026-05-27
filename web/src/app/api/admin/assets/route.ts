import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { assets, organizations } from "@/lib/db/schema"
import { eq, ilike, or, sql, and } from "drizzle-orm"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const ASSET_CATEGORIES = ["computer", "screen", "printer", "server", "network_equipment", "other"] as const
const ASSET_STATUSES = ["active", "inactive", "in_maintenance", "retired", "disposed", "missing"] as const

const createSchema = z.object({
  organizationId: z.string().uuid(),
  category: z.enum(ASSET_CATEGORIES),
  name: z.string().min(1).max(255),
  make: z.string().max(100).nullable().optional(),
  model: z.string().max(255).nullable().optional(),
  serialNumber: z.string().max(255).nullable().optional(),
  status: z.enum(ASSET_STATUSES).default("active"),
  purchaseDate: z.string().nullable().optional(),
  purchasePrice: z.coerce.number().nonnegative().nullable().optional(),
  warrantyExpiryDate: z.string().nullable().optional(),
  assignedToName: z.string().max(255).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  notes: z.string().nullable().optional(),
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
  const search = searchParams.get("search") ?? ""
  const category = searchParams.get("category") ?? ""
  const status = searchParams.get("status") ?? ""
  const organizationId = searchParams.get("organizationId") ?? ""
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200)
  const offset = (page - 1) * limit
  const syncedOnly = searchParams.get("synced") === "true"

  const conditions = []
  if (search) {
    conditions.push(
      or(
        ilike(assets.name, `%${search}%`),
        ilike(assets.serialNumber, `%${search}%`),
        ilike(assets.make, `%${search}%`),
        ilike(assets.model, `%${search}%`),
        ilike(assets.assignedToName, `%${search}%`),
        ilike(assets.ipAddress, `%${search}%`),
      )
    )
  }
  if (category && ASSET_CATEGORIES.includes(category as typeof ASSET_CATEGORIES[number])) {
    conditions.push(eq(assets.category, category as typeof ASSET_CATEGORIES[number]))
  }
  if (status && ASSET_STATUSES.includes(status as typeof ASSET_STATUSES[number])) {
    conditions.push(eq(assets.status, status as typeof ASSET_STATUSES[number]))
  }
  if (organizationId) conditions.push(eq(assets.organizationId, organizationId))
  if (syncedOnly) conditions.push(sql`${assets.ateraAgentId} IS NOT NULL`)

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: assets.id,
        organizationId: assets.organizationId,
        organizationName: organizations.name,
        category: assets.category,
        name: assets.name,
        make: assets.make,
        model: assets.model,
        serialNumber: assets.serialNumber,
        status: assets.status,
        assignedToName: assets.assignedToName,
        location: assets.location,
        purchaseDate: assets.purchaseDate,
        purchasePrice: assets.purchasePrice,
        warrantyExpiryDate: assets.warrantyExpiryDate,
        ateraAgentId: assets.ateraAgentId,
        osName: assets.osName,
        ramGb: assets.ramGb,
        diskTotalGb: assets.diskTotalGb,
        ipAddress: assets.ipAddress,
        macAddress: assets.macAddress,
        lastSeenAt: assets.lastSeenAt,
        ateraSyncedAt: assets.ateraSyncedAt,
        syncOverrides: assets.syncOverrides,
        notes: assets.notes,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
      })
      .from(assets)
      .leftJoin(organizations, eq(assets.organizationId, organizations.id))
      .where(where)
      .orderBy(assets.category, assets.name)
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(assets).where(where),
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
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const d = parsed.data
  const [item] = await db
    .insert(assets)
    .values({
      organizationId: d.organizationId,
      category: d.category,
      name: d.name,
      make: d.make ?? null,
      model: d.model ?? null,
      serialNumber: d.serialNumber ?? null,
      status: d.status,
      purchaseDate: d.purchaseDate ?? null,
      purchasePrice: d.purchasePrice != null ? String(d.purchasePrice) : null,
      warrantyExpiryDate: d.warrantyExpiryDate ?? null,
      assignedToName: d.assignedToName ?? null,
      location: d.location ?? null,
      notes: d.notes ?? null,
      createdByUserId: actorId ?? null,
      syncOverrides: {},
    })
    .returning()

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.SETTINGS_UPDATE,
    resourceType: "asset",
    resourceId: item.id,
    newValue: { name: item.name, category: item.category, organizationId: item.organizationId },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true, data: item }, { status: 201 })
}
