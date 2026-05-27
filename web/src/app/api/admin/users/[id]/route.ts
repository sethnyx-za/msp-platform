import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  getUserById, updateUser, deactivateUser, reactivateUser,
  resetUserPassword, disableMfa, addMembership, removeMembership,
  updateMembershipRole, checkEmailAvailable,
} from "@/lib/services/users"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const USER_ROLES = ["msp_super_admin", "msp_technician", "client_admin", "client_approver", "client_user"] as const

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).max(100).nullable().optional(),
  isMspStaff: z.boolean().optional(),
  isActive: z.boolean().optional(),
  mustChangePwd: z.boolean().optional(),
})

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  mustChangePwd: z.boolean().optional(),
})

const membershipSchema = z.object({
  organizationId: z.string().min(1),
  role: z.enum(USER_ROLES),
  isPrimary: z.boolean().optional(),
  crossOrgAccess: z.boolean().optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

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
  const user = await getUserById(id)
  if (!user) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

  const { passwordHash: _, totpSecret: __, ...safeUser } = user
  return NextResponse.json({ success: true, data: safeUser })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const { id } = await params
  const existing = await getUserById(id)
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

  const url = new URL(req.url)
  const action = url.searchParams.get("action")

  if (action === "reset-password") {
    const body = await req.json().catch(() => null)
    const parsed = resetPasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
    }
    await resetUserPassword(id, parsed.data.newPassword, parsed.data.mustChangePwd ?? true)
    await writeAuditLog({
      userId: actorId ?? undefined,
      action: AuditAction.USER_PASSWORD_RESET,
      resourceType: "user",
      resourceId: id,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    })
    return NextResponse.json({ success: true })
  }

  if (action === "disable-mfa") {
    await disableMfa(id)
    await writeAuditLog({
      userId: actorId ?? undefined,
      action: AuditAction.USER_MFA_DISABLED,
      resourceType: "user",
      resourceId: id,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    })
    return NextResponse.json({ success: true })
  }

  if (action === "add-membership") {
    const body = await req.json().catch(() => null)
    const parsed = membershipSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
    }
    const membership = await addMembership({ userId: id, ...parsed.data })
    return NextResponse.json({ success: true, data: membership })
  }

  if (action === "remove-membership") {
    const body = await req.json().catch(() => null)
    const orgId = body?.organizationId
    if (!orgId) return NextResponse.json({ success: false, error: "organizationId required" }, { status: 400 })
    await removeMembership(id, orgId)
    return NextResponse.json({ success: true })
  }

  if (action === "update-membership-role") {
    const body = await req.json().catch(() => null)
    const orgId = body?.organizationId
    const role = body?.role
    if (!orgId || !role) return NextResponse.json({ success: false, error: "organizationId and role required" }, { status: 400 })
    const membership = await updateMembershipRole(id, orgId, role)
    return NextResponse.json({ success: true, data: membership })
  }

  // Default: update user fields
  const body = await req.json().catch(() => null)
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  if (parsed.data.email) {
    const available = await checkEmailAvailable(parsed.data.email, id)
    if (!available) return NextResponse.json({ success: false, error: "Email already in use" }, { status: 409 })
  }

  const updated = await updateUser(id, parsed.data)
  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.USER_UPDATE,
    resourceType: "user",
    resourceId: id,
    previousValue: { email: existing.email },
    newValue: parsed.data,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  const { passwordHash: _, totpSecret: __, ...safeUser } = updated!
  return NextResponse.json({ success: true, data: safeUser })
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const { id } = await params

  // Cannot deactivate yourself
  if (actorId === id) {
    return NextResponse.json({ success: false, error: "Cannot deactivate your own account" }, { status: 400 })
  }

  const existing = await getUserById(id)
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })

  const action = new URL(req.url).searchParams.get("action")
  if (action === "reactivate") {
    await reactivateUser(id)
    await writeAuditLog({
      userId: actorId ?? undefined,
      action: AuditAction.USER_UPDATE,
      resourceType: "user",
      resourceId: id,
      newValue: { isActive: true },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    })
    return NextResponse.json({ success: true })
  }

  await deactivateUser(id)
  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.USER_DEACTIVATE,
    resourceType: "user",
    resourceId: id,
    newValue: { isActive: false },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true })
}
