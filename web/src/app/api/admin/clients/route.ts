import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getClientOrganizations, createOrganization, checkSlugAvailable } from "@/lib/services/organizations"
import { writeAuditLog, AuditAction } from "@/lib/audit"
import { slugify } from "@/lib/utils"
import { nanoid } from "nanoid"

const createClientSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
  parentId: z.string().nullable().optional(),
  isMaster: z.boolean().optional(),
  address: z.string().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  website: z.string().url().nullable().optional(),
  slaHoursResponse: z.number().int().min(1).max(168).nullable().optional(),
  slaHoursResolution: z.number().int().min(1).max(720).nullable().optional(),
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
  const parentId = searchParams.has("parentId")
    ? searchParams.get("parentId") === "null" ? null : searchParams.get("parentId")!
    : undefined

  const result = await getClientOrganizations({ page, limit, search, parentId })
  return NextResponse.json({ success: true, ...result })
}

export async function POST(req: NextRequest) {
  const isMspStaff = req.headers.get("x-is-msp-staff")
  const userId = req.headers.get("x-user-id")
  if (isMspStaff !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createClientSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data
  const slug = data.slug ?? slugify(data.name) + "-" + nanoid(6)

  const available = await checkSlugAvailable(slug)
  if (!available) {
    return NextResponse.json({ success: false, error: "Slug is already taken" }, { status: 409 })
  }

  const org = await createOrganization({ ...data, slug, isMspOrg: false })

  await writeAuditLog({
    userId: userId ?? undefined,
    action: AuditAction.ORG_CREATE,
    resourceType: "organization",
    resourceId: org.id,
    newValue: { name: org.name, slug: org.slug },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true, data: org }, { status: 201 })
}
