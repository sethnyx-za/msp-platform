import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getUsers, createUser, addMembership, checkEmailAvailable } from "@/lib/services/users"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const USER_ROLES = ["msp_super_admin", "msp_technician", "client_admin", "client_approver", "client_user"] as const

const createUserSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
      message: "Password must contain upper, lower, digit, and special character",
    }),
  name: z.string().min(1).max(100).nullable().optional(),
  isMspStaff: z.boolean().optional(),
  mustChangePwd: z.boolean().optional(),
  organizationId: z.string().min(1),
  role: z.enum(USER_ROLES),
  crossOrgAccess: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const isMspStaff = req.headers.get("x-is-msp-staff")
  if (isMspStaff !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100)
  const search = searchParams.get("search") ?? undefined
  const organizationId = searchParams.get("organizationId") ?? undefined
  const staffOnly = searchParams.get("isMspStaff")
  const isMspStaffFilter = staffOnly === "true" ? true : staffOnly === "false" ? false : undefined

  const result = await getUsers({ page, limit, search, organizationId, isMspStaff: isMspStaffFilter })
  return NextResponse.json({ success: true, ...result })
}

export async function POST(req: NextRequest) {
  const isMspStaff = req.headers.get("x-is-msp-staff")
  const actorId = req.headers.get("x-user-id")
  if (isMspStaff !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  // Check email uniqueness
  const available = await checkEmailAvailable(data.email)
  if (!available) {
    return NextResponse.json({ success: false, error: "Email already in use" }, { status: 409 })
  }

  // MSP staff flag must align with role
  const isMspRole = data.role === "msp_super_admin" || data.role === "msp_technician"
  const isMspStaffFlag = data.isMspStaff ?? isMspRole

  const user = await createUser({
    email: data.email,
    password: data.password,
    name: data.name,
    isMspStaff: isMspStaffFlag,
    mustChangePwd: data.mustChangePwd ?? true, // Force password change by default
  })

  await addMembership({
    userId: user.id,
    organizationId: data.organizationId,
    role: data.role,
    isPrimary: true,
    crossOrgAccess: data.crossOrgAccess ?? false,
  })

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.USER_CREATE,
    resourceType: "user",
    resourceId: user.id,
    newValue: { email: user.email, role: data.role, organizationId: data.organizationId },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  const { passwordHash: _, totpSecret: __, ...safeUser } = user
  return NextResponse.json({ success: true, data: safeUser }, { status: 201 })
}
