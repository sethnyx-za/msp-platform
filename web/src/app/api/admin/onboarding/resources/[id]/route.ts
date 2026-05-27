import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { onboardingSharedResources } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

interface RouteContext { params: Promise<{ id: string }> }

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
})

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = guardMsp(req)
  if (guard) return guard

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.description !== undefined) updates.description = parsed.data.description
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder

  const [updated] = await db.update(onboardingSharedResources).set(updates).where(eq(onboardingSharedResources.id, id)).returning()
  if (!updated) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const guard = guardMsp(req)
  if (guard) return guard

  const { id } = await params
  const [deleted] = await db.update(onboardingSharedResources)
    .set({ isActive: false })
    .where(eq(onboardingSharedResources.id, id))
    .returning()
  if (!deleted) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true })
}
