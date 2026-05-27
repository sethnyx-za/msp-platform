import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getOrganizationById, updateOrganization, deactivateOrganization, reactivateOrganization } from "@/lib/services/organizations"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const updateClientSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  address: z.string().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  website: z.string().url().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  slaHoursResponse: z.number().int().min(1).max(168).nullable().optional(),
  slaHoursResolution: z.number().int().min(1).max(720).nullable().optional(),
  parentId: z.string().nullable().optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const isMspStaff = _req.headers.get("x-is-msp-staff")
  if (isMspStaff !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const org = await getOrganizationById(id)
  if (!org) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true, data: org })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const isMspStaff = req.headers.get("x-is-msp-staff")
  const userId = req.headers.get("x-user-id")
  if (isMspStaff !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await getOrganizationById(id)
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = updateClientSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const updated = await updateOrganization(id, parsed.data)

  await writeAuditLog({
    userId: userId ?? undefined,
    action: AuditAction.ORG_UPDATE,
    resourceType: "organization",
    resourceId: id,
    previousValue: { name: existing.name },
    newValue: parsed.data,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true, data: updated })
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const isMspStaff = req.headers.get("x-is-msp-staff")
  const userId = req.headers.get("x-user-id")
  if (isMspStaff !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await getOrganizationById(id)
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
  if (existing.isMspOrg) {
    return NextResponse.json({ success: false, error: "Cannot deactivate MSP organisation" }, { status: 400 })
  }

  const action = new URL(req.url).searchParams.get("action")
  if (action === "reactivate") {
    await reactivateOrganization(id)
    await writeAuditLog({
      userId: userId ?? undefined,
      action: AuditAction.ORG_UPDATE,
      resourceType: "organization",
      resourceId: id,
      newValue: { isActive: true },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    })
    return NextResponse.json({ success: true })
  }

  await deactivateOrganization(id)
  await writeAuditLog({
    userId: userId ?? undefined,
    action: AuditAction.ORG_DEACTIVATE,
    resourceType: "organization",
    resourceId: id,
    previousValue: { isActive: true },
    newValue: { isActive: false },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true })
}
