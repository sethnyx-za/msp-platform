import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { testUnifiConnection, listUnifiSites } from "@/lib/services/integrations/unifi-client"
import { getUnifiCredentials, saveUnifiCredentials, removeUnifiCredentials, getUnifiSiteMappings, upsertUnifiSiteMapping } from "@/lib/services/integrations"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const saveUnifiSchema = z.object({
  organizationId: z.string().min(1),
  apiKey: z.string().min(10),
  fabricId: z.string().optional(),
  fabricName: z.string().optional(),
})

const mapSiteSchema = z.object({
  organizationId: z.string().min(1),
  unifiSiteId: z.string().min(1),
  unifiSiteName: z.string().min(1),
  fabricId: z.string().optional(),
  fabricName: z.string().optional(),
})

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

// GET /api/admin/integrations/unifi?organizationId=xxx
// Returns connection status, site list, and existing mappings
export async function GET(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const organizationId = new URL(req.url).searchParams.get("organizationId")
  if (!organizationId) {
    return NextResponse.json({ success: false, error: "organizationId is required" }, { status: 400 })
  }

  const creds = await getUnifiCredentials(organizationId)

  if (!creds) {
    return NextResponse.json({
      success: true,
      data: { configured: false, connected: false, sites: [], mappings: [] },
    })
  }

  // Test connection and fetch sites
  const [connectionTest, mappings] = await Promise.all([
    testUnifiConnection(creds.apiKey),
    getUnifiSiteMappings(organizationId),
  ])

  if (!connectionTest.ok) {
    return NextResponse.json({
      success: true,
      data: {
        configured: true,
        connected: false,
        error: connectionTest.error,
        fabricId: creds.fabricId,
        fabricName: creds.fabricName,
        sites: [],
        mappings,
      },
    })
  }

  const sites = await listUnifiSites(creds.apiKey).catch(() => [])

  return NextResponse.json({
    success: true,
    data: {
      configured: true,
      connected: true,
      siteCount: connectionTest.siteCount,
      fabricId: creds.fabricId,
      fabricName: creds.fabricName,
      sites,
      mappings,
    },
  })
}

// POST /api/admin/integrations/unifi — save Fabric API key for a client
export async function POST(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const body = await req.json().catch(() => null)

  const url = new URL(req.url)
  const action = url.searchParams.get("action")

  if (action === "map-site") {
    const parsed = mapSiteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
    }
    const mapping = await upsertUnifiSiteMapping(
      parsed.data.organizationId,
      parsed.data.unifiSiteId,
      parsed.data.unifiSiteName,
      { fabricId: parsed.data.fabricId, fabricName: parsed.data.fabricName }
    )
    return NextResponse.json({ success: true, data: mapping })
  }

  // Default: save API key
  const parsed = saveUnifiSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  // Test the key before saving
  const test = await testUnifiConnection(parsed.data.apiKey)
  if (!test.ok) {
    return NextResponse.json({
      success: false,
      error: `Connection test failed: ${test.error}`,
    }, { status: 422 })
  }

  await saveUnifiCredentials(
    parsed.data.organizationId,
    {
      apiKey: parsed.data.apiKey,
      fabricId: parsed.data.fabricId,
      fabricName: parsed.data.fabricName,
    },
    { fabricId: parsed.data.fabricId, fabricName: parsed.data.fabricName }
  )

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.INTEGRATION_UPDATE,
    resourceType: "integration",
    resourceId: parsed.data.organizationId,
    newValue: { type: "unifi", fabricId: parsed.data.fabricId, fabricName: parsed.data.fabricName },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true, data: { connected: true, siteCount: test.siteCount } }, { status: 201 })
}

// DELETE /api/admin/integrations/unifi?organizationId=xxx
export async function DELETE(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const organizationId = new URL(req.url).searchParams.get("organizationId")
  if (!organizationId) {
    return NextResponse.json({ success: false, error: "organizationId is required" }, { status: 400 })
  }

  await removeUnifiCredentials(organizationId)

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.INTEGRATION_UPDATE,
    resourceType: "integration",
    resourceId: organizationId,
    newValue: { type: "unifi", removed: true },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({ success: true })
}
