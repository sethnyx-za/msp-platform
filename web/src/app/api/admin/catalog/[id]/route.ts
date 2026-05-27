import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { catalogItems } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  sku: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  supplier: z.string().max(255).nullable().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  isActive: z.boolean().optional(),
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
  const [item] = await db.select().from(catalogItems).where(eq(catalogItems.id, id)).limit(1)
  if (!item) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true, data: item })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const { id } = await params

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  const d = parsed.data
  if (d.name !== undefined) updates.name = d.name
  if (d.description !== undefined) updates.description = d.description
  if (d.sku !== undefined) updates.sku = d.sku
  if (d.category !== undefined) updates.category = d.category
  if (d.supplier !== undefined) updates.supplier = d.supplier
  if (d.unitPrice !== undefined) updates.unitPrice = String(d.unitPrice)
  if (d.currency !== undefined) updates.currency = d.currency
  if (d.isActive !== undefined) updates.isActive = d.isActive

  const [updated] = await db.update(catalogItems).set(updates).where(eq(catalogItems.id, id)).returning()
  if (!updated) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.SETTINGS_UPDATE,
    resourceType: "catalog_item",
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

  // Soft delete — set isActive = false
  const [updated] = await db
    .update(catalogItems)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(catalogItems.id, id))
    .returning()

  if (!updated) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.SETTINGS_UPDATE,
    resourceType: "catalog_item",
    resourceId: id,
    newValue: { isActive: false },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true })
}
