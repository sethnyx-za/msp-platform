import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { assets, organizations } from "@/lib/db/schema"
import { eq, ilike, or, and, sql } from "drizzle-orm"

const ASSET_CATEGORIES = ["computer", "screen", "printer", "server", "network_equipment", "other"] as const
const ASSET_STATUSES = ["active", "inactive", "in_maintenance", "retired", "disposed", "missing"] as const

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

function csvEscape(val: unknown): string {
  if (val == null) return ""
  const str = String(val)
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") ?? ""
  const category = searchParams.get("category") ?? ""
  const status = searchParams.get("status") ?? ""
  const organizationId = searchParams.get("organizationId") ?? ""
  const syncedOnly = searchParams.get("synced") === "true"

  const conditions = []
  if (search) {
    conditions.push(
      or(
        ilike(assets.name, `%${search}%`),
        ilike(assets.serialNumber, `%${search}%`),
        ilike(assets.make, `%${search}%`),
        ilike(assets.model, `%${search}%`),
        ilike(assets.assignedToName, `%${search}%`),
        ilike(assets.ipAddress, `%${search}%`),
      )
    )
  }
  if (category && ASSET_CATEGORIES.includes(category as typeof ASSET_CATEGORIES[number])) {
    conditions.push(eq(assets.category, category as typeof ASSET_CATEGORIES[number]))
  }
  if (status && ASSET_STATUSES.includes(status as typeof ASSET_STATUSES[number])) {
    conditions.push(eq(assets.status, status as typeof ASSET_STATUSES[number]))
  }
  if (organizationId) conditions.push(eq(assets.organizationId, organizationId))
  if (syncedOnly) conditions.push(sql`${assets.ateraAgentId} IS NOT NULL`)

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const rows = await db
    .select({
      name: assets.name,
      category: assets.category,
      status: assets.status,
      make: assets.make,
      model: assets.model,
      serialNumber: assets.serialNumber,
      organizationName: organizations.name,
      assignedToName: assets.assignedToName,
      location: assets.location,
      osName: assets.osName,
      osVersion: assets.osVersion,
      cpuName: assets.cpuName,
      ramGb: assets.ramGb,
      diskTotalGb: assets.diskTotalGb,
      ipAddress: assets.ipAddress,
      macAddress: assets.macAddress,
      patchStatus: assets.patchStatus,
      avStatus: assets.avStatus,
      purchaseDate: assets.purchaseDate,
      purchasePrice: assets.purchasePrice,
      warrantyExpiryDate: assets.warrantyExpiryDate,
      lastSeenAt: assets.lastSeenAt,
      ateraSyncedAt: assets.ateraSyncedAt,
      notes: assets.notes,
      createdAt: assets.createdAt,
    })
    .from(assets)
    .leftJoin(organizations, eq(assets.organizationId, organizations.id))
    .where(where)
    .orderBy(organizations.name, assets.category, assets.name)
    .limit(5000)

  const headers = [
    "Name", "Category", "Status", "Make", "Model", "Serial Number", "Organisation",
    "Assigned To", "Location", "OS", "OS Version", "CPU", "RAM (GB)", "Disk Total (GB)",
    "IP Address", "MAC Address", "Patch Status", "AV Status",
    "Purchase Date", "Purchase Price", "Warranty Expiry", "Last Seen", "Atera Synced At",
    "Notes", "Created At",
  ]

  const csvRows = rows.map((r) => [
    r.name, r.category, r.status, r.make, r.model, r.serialNumber, r.organizationName,
    r.assignedToName, r.location, r.osName, r.osVersion, r.cpuName, r.ramGb, r.diskTotalGb,
    r.ipAddress, r.macAddress, r.patchStatus, r.avStatus,
    r.purchaseDate, r.purchasePrice, r.warrantyExpiryDate, r.lastSeenAt, r.ateraSyncedAt,
    r.notes, r.createdAt,
  ].map(csvEscape).join(","))

  const csv = [headers.join(","), ...csvRows].join("\n")
  const filename = `assets-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
