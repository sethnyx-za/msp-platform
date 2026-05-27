import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { testAteraConnection, listAteraCustomers } from "@/lib/services/integrations/atera-client"
import { upsertAteraMapping, removeAteraMapping, getAteraMappings } from "@/lib/services/integrations"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const mapCustomerSchema = z.object({
  organizationId: z.string().min(1),
  ateraCustomerId: z.number().int().positive(),
  ateraCustomerName: z.string().min(1),
})

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

// GET /api/admin/integrations/atera
// Returns connection status, customer list, and existing mappings
export async function GET(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId")

  // Test connection
  const connectionTest = await testAteraConnection()

  if (!connectionTest.ok) {
    return NextResponse.json({
      success: true,
      data: {
        connected: false,
        error: connectionTest.error,
        customers: [],
        mappings: [],
      },
    })
  }

  // Load customers and mappings in parallel
  const [customers, mappings] = await Promise.all([
    listAteraCustomers().catch(() => []),
    organizationId ? getAteraMappings(organizationId) : Promise.resolve([]),
  ])

  return NextResponse.json({
    success: true,
    data: {
      connected: true,
      customerCount: connectionTest.customerCount,
      customers,
      mappings,
    },
  })
}

// POST /api/admin/integrations/atera — map a client org to an Atera customer
export async function POST(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const body = await req.json().catch(() => null)
  const parsed = mapCustomerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const mapping = await upsertAteraMapping(
    parsed.data.organizationId,
    parsed.data.ateraCustomerId,
    parsed.data.ateraCustomerName
  )

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.INTEGRATION_UPDATE,
    resourceType: "integration",
    resourceId: parsed.data.organizationId,
    newValue: { type: "atera", ateraCustomerId: parsed.data.ateraCustomerId },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true, data: mapping }, { status: 201 })
}

// DELETE /api/admin/integrations/atera?organizationId=xxx
export async function DELETE(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const organizationId = new URL(req.url).searchParams.get("organizationId")
  if (!organizationId) {
    return NextResponse.json({ success: false, error: "organizationId is required" }, { status: 400 })
  }

  await removeAteraMapping(organizationId)

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.INTEGRATION_UPDATE,
    resourceType: "integration",
    resourceId: organizationId,
    newValue: { type: "atera", removed: true },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true })
}
