import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { testUispConnection } from "@/lib/services/integrations/uisp-client"
import { getUispCredentials, saveUispCredentials, removeUispCredentials } from "@/lib/services/integrations"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const saveUispSchema = z.object({
  organizationId: z.string().min(1),
  host: z.string().min(3),
  apiToken: z.string().min(10),
  useTls: z.boolean().optional(),
})

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

// GET /api/admin/integrations/uisp?organizationId=xxx
export async function GET(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const organizationId = new URL(req.url).searchParams.get("organizationId")
  if (!organizationId) {
    return NextResponse.json({ success: false, error: "organizationId is required" }, { status: 400 })
  }

  const creds = await getUispCredentials(organizationId)

  if (!creds) {
    return NextResponse.json({ success: true, data: { configured: false, connected: false } })
  }

  const connectionTest = await testUispConnection(creds)

  return NextResponse.json({
    success: true,
    data: {
      configured: true,
      connected: connectionTest.ok,
      host: creds.host,
      useTls: creds.useTls,
      deviceCount: connectionTest.deviceCount,
      error: connectionTest.error,
    },
  })
}

// POST /api/admin/integrations/uisp — save UISP credentials
export async function POST(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const body = await req.json().catch(() => null)
  const parsed = saveUispSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const creds = { host: parsed.data.host, apiToken: parsed.data.apiToken, useTls: parsed.data.useTls ?? true }

  // Test before saving
  const test = await testUispConnection(creds)
  if (!test.ok) {
    return NextResponse.json({
      success: false,
      error: `Connection test failed: ${test.error}`,
    }, { status: 422 })
  }

  await saveUispCredentials(parsed.data.organizationId, creds)

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.INTEGRATION_UPDATE,
    resourceType: "integration",
    resourceId: parsed.data.organizationId,
    newValue: { type: "uisp", host: creds.host },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true, data: { connected: true, deviceCount: test.deviceCount } }, { status: 201 })
}

// DELETE /api/admin/integrations/uisp?organizationId=xxx
export async function DELETE(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const organizationId = new URL(req.url).searchParams.get("organizationId")
  if (!organizationId) {
    return NextResponse.json({ success: false, error: "organizationId is required" }, { status: 400 })
  }

  await removeUispCredentials(organizationId)

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.INTEGRATION_UPDATE,
    resourceType: "integration",
    resourceId: organizationId,
    newValue: { type: "uisp", removed: true },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true })
}
