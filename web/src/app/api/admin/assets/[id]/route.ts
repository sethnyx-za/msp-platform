import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { assets, organizations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { writeAuditLog, AuditAction } from "@/lib/audit"

// Fields that Atera sync controls — manual edits to these are tracked in syncOverrides
const ATERA_MANAGED_FIELDS = new Set([
  "name", "make", "serialNumber", "osName",
  "diskTotalGb", "ramGb", "ipAddress", "macAddress",
  "osVersion", "cpuName", "patchStatus", "avStatus",
])

const updateSchema = z.object({
  category: z.enum(["computer", "screen", "printer", "server", "network_equipment", "other"]).optional(),
  name: z.string().min(1).max(255).optional(),
  make: z.string().max(100).nullable().optional(),
  model: z.string().max(255).nullable().optional(),
  serialNumber: z.string().max(255).nullable().optional(),
  status: z.enum(["active", "inactive", "in_maintenance", "retired", "disposed", "missing"]).optional(),
  purchaseDate: z.string().nullable().optional(),
  purchasePrice: z.coerce.number().nonnegative().nullable().optional(),
  warrantyExpiryDate: z.string().nullable().optional(),
  assignedToName: z.string().max(255).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  notes: z.string().nullable().optional(),
  osName: z.string().max(100).nullable().optional(),
  osVersion: z.string().max(100).nullable().optional(),
  cpuName: z.string().max(255).nullable().optional(),
  ramGb: z.coerce.number().int().nonnegative().nullable().optional(),
  diskTotalGb: z.coerce.number().nonnegative().nullable().optional(),
  ipAddress: z.string().max(45).nullable().optional(),
  macAddress: z.string().max(17).nullable().optional(),
  patchStatus: z.string().max(50).nullable().optional(),
  avStatus: z.string().max(50).nullable().optional(),
})

interface RouteContext { params: Promise<{ id: string }> }

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const guard = guardMsp(req)
  if (guard) return guard

  const { id } = await params

  const rows = await db
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
      ateraDeviceGuid: assets.ateraDeviceGuid,
      osName: assets.osName,
      osVersion: assets.osVersion,
      cpuName: assets.cpuName,
      ramGb: assets.ramGb,
      diskTotalGb: assets.diskTotalGb,
      diskFreeGb: assets.diskFreeGb,
      diskUsagePercent: assets.diskUsagePercent,
      ipAddress: assets.ipAddress,
      macAddress: assets.macAddress,
      lastSeenAt: assets.lastSeenAt,
      patchStatus: assets.patchStatus,
      avStatus: assets.avStatus,
      avDefinitionDate: assets.avDefinitionDate,
      ateraSyncedAt: assets.ateraSyncedAt,
      syncOverrides: assets.syncOverrides,
      notes: assets.notes,
      createdByUserId: assets.createdByUserId,
      createdAt: assets.createdAt,
      updatedAt: assets.updatedAt,
    })
    .from(assets)
    .leftJoin(organizations, eq(assets.organizationId, organizations.id))
    .where(eq(assets.id, id))
    .limit(1)

  if (!rows[0]) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true, data: rows[0] })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const { id } = await params

  const [existing] = await db.select().from(assets).where(eq(assets.id, id)).limit(1)
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const d = parsed.data
  const updates: Record<string, unknown> = { updatedAt: new Date() }

  if (d.category !== undefined) updates.category = d.category
  if (d.name !== undefined) updates.name = d.name
  if (d.make !== undefined) updates.make = d.make
  if (d.model !== undefined) updates.model = d.model
  if (d.serialNumber !== undefined) updates.serialNumber = d.serialNumber
  if (d.status !== undefined) updates.status = d.status
  if (d.purchaseDate !== undefined) updates.purchaseDate = d.purchaseDate
  if (d.purchasePrice !== undefined) updates.purchasePrice = d.purchasePrice != null ? String(d.purchasePrice) : null
  if (d.warrantyExpiryDate !== undefined) updates.warrantyExpiryDate = d.warrantyExpiryDate
  if (d.assignedToName !== undefined) updates.assignedToName = d.assignedToName
  if (d.location !== undefined) updates.location = d.location
  if (d.notes !== undefined) updates.notes = d.notes
  if (d.osName !== undefined) updates.osName = d.osName
  if (d.osVersion !== undefined) updates.osVersion = d.osVersion
  if (d.cpuName !== undefined) updates.cpuName = d.cpuName
  if (d.ramGb !== undefined) updates.ramGb = d.ramGb
  if (d.diskTotalGb !== undefined) updates.diskTotalGb = d.diskTotalGb != null ? String(d.diskTotalGb) : null
  if (d.ipAddress !== undefined) updates.ipAddress = d.ipAddress
  if (d.macAddress !== undefined) updates.macAddress = d.macAddress
  if (d.patchStatus !== undefined) updates.patchStatus = d.patchStatus
  if (d.avStatus !== undefined) updates.avStatus = d.avStatus

  // Track manual overrides for Atera-managed fields
  if (existing.ateraAgentId) {
    const currentOverrides = (existing.syncOverrides ?? {}) as Record<string, boolean>
    const newOverrides = { ...currentOverrides }
    for (const field of Object.keys(d)) {
      if (ATERA_MANAGED_FIELDS.has(field) && d[field as keyof typeof d] !== undefined) {
        newOverrides[field] = true
      }
    }
    updates.syncOverrides = newOverrides
  }

  const [updated] = await db
    .update(assets)
    .set(updates)
    .where(eq(assets.id, id))
    .returning()

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.SETTINGS_UPDATE,
    resourceType: "asset",
    resourceId: id,
    newValue: updates,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const { id } = await params

  const [updated] = await db
    .update(assets)
    .set({ status: "retired", updatedAt: new Date() })
    .where(eq(assets.id, id))
    .returning()

  if (!updated) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.SETTINGS_UPDATE,
    resourceType: "asset",
    resourceId: id,
    newValue: { status: "retired" },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true })
}
