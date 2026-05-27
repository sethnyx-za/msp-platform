import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { assets, organizations } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { ArrowLeft, RefreshCw, Pencil, HardDrive, Cpu, MemoryStick, Network, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDateTime, formatCurrency } from "@/lib/utils"
import AssetActions from "@/components/admin/assets/AssetActions"
import type { AssetItem } from "@/components/admin/assets/AssetDialog"

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const rows = await db.select({ name: assets.name }).from(assets).where(eq(assets.id, id)).limit(1)
  return { title: rows[0]?.name ?? "Asset" }
}

const CATEGORY_LABELS: Record<string, string> = {
  computer: "Computer", screen: "Screen / Monitor", printer: "Printer",
  server: "Server", network_equipment: "Network Equipment", other: "Other",
}

const STATUS_VARIANTS: Record<string, "success" | "secondary" | "destructive" | "outline" | "warning"> = {
  active: "success", inactive: "secondary", in_maintenance: "warning",
  retired: "secondary", disposed: "destructive", missing: "destructive",
}

const ATERA_FIELDS: { key: string; label: string; unit?: string }[] = [
  { key: "osName", label: "Operating System" },
  { key: "osVersion", label: "OS Version" },
  { key: "cpuName", label: "CPU" },
  { key: "ramGb", label: "RAM", unit: "GB" },
  { key: "diskTotalGb", label: "Disk Total", unit: "GB" },
  { key: "diskFreeGb", label: "Disk Free", unit: "GB" },
  { key: "ipAddress", label: "IP Address" },
  { key: "macAddress", label: "MAC Address" },
  { key: "patchStatus", label: "Patch Status" },
  { key: "avStatus", label: "AV Status" },
]

function field(label: string, value: unknown, mono = false) {
  if (value == null || value === "") return null
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{String(value)}</p>
    </div>
  )
}

export default async function AssetDetailPage({ params }: Props) {
  const [session, { id }] = await Promise.all([auth(), params])
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  const rows = await db
    .select({
      id: assets.id,
      organizationId: assets.organizationId,
      organizationName: organizations.name,
      category: assets.category,
      name: assets.name,
      make: assets.make,
      model: assets.model,
      serialNumber: assets.serialNumber,
      status: assets.status,
      assignedToName: assets.assignedToName,
      location: assets.location,
      purchaseDate: assets.purchaseDate,
      purchasePrice: assets.purchasePrice,
      warrantyExpiryDate: assets.warrantyExpiryDate,
      ateraAgentId: assets.ateraAgentId,
      ateraDeviceGuid: assets.ateraDeviceGuid,
      osName: assets.osName,
      osVersion: assets.osVersion,
      cpuName: assets.cpuName,
      ramGb: assets.ramGb,
      diskTotalGb: assets.diskTotalGb,
      diskFreeGb: assets.diskFreeGb,
      diskUsagePercent: assets.diskUsagePercent,
      ipAddress: assets.ipAddress,
      macAddress: assets.macAddress,
      lastSeenAt: assets.lastSeenAt,
      patchStatus: assets.patchStatus,
      avStatus: assets.avStatus,
      avDefinitionDate: assets.avDefinitionDate,
      ateraSyncedAt: assets.ateraSyncedAt,
      syncOverrides: assets.syncOverrides,
      notes: assets.notes,
      createdByUserId: assets.createdByUserId,
      createdAt: assets.createdAt,
      updatedAt: assets.updatedAt,
    })
    .from(assets)
    .leftJoin(organizations, eq(assets.organizationId, organizations.id))
    .where(eq(assets.id, id))
    .limit(1)

  const asset = rows[0]
  if (!asset) notFound()

  const syncOverrides = (asset.syncOverrides ?? {}) as Record<string, boolean>

  // Build AssetItem shape for client components
  const assetItem: AssetItem = {
    id: asset.id,
    organizationId: asset.organizationId,
    organizationName: asset.organizationName,
    category: asset.category,
    name: asset.name,
    make: asset.make,
    model: asset.model,
    serialNumber: asset.serialNumber,
    status: asset.status,
    assignedToName: asset.assignedToName,
    location: asset.location,
    purchaseDate: asset.purchaseDate,
    purchasePrice: asset.purchasePrice,
    warrantyExpiryDate: asset.warrantyExpiryDate,
    ateraAgentId: asset.ateraAgentId,
    notes: asset.notes,
    syncOverrides,
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 max-w-4xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/assets" className="flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Assets
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{asset.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{asset.name}</h1>
              <Badge variant="outline">{CATEGORY_LABELS[asset.category] ?? asset.category}</Badge>
              <Badge variant={STATUS_VARIANTS[asset.status] ?? "outline"} className="capitalize">
                {asset.status.replace(/_/g, " ")}
              </Badge>
              {asset.ateraAgentId && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <RefreshCw className="h-3 w-3" /> Atera Synced
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {asset.organizationName ?? "Unknown org"}{asset.location ? ` — ${asset.location}` : ""}
            </p>
          </div>
          <AssetActions asset={assetItem} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Core Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Device Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3">
              {field("Make", asset.make)}
              {field("Model", asset.model)}
              {field("Serial Number", asset.serialNumber, true)}
              {field("Assigned To", asset.assignedToName)}
              {field("Location", asset.location)}
              {field("Client", asset.organizationName)}
            </CardContent>
          </Card>

          {/* Financial */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Financial & Warranty</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3">
              {field("Purchase Date", asset.purchaseDate)}
              {field("Purchase Price",
                asset.purchasePrice != null
                  ? formatCurrency(parseFloat(String(asset.purchasePrice)), "ZAR")
                  : null
              )}
              {field("Warranty Expiry", asset.warrantyExpiryDate)}
              {!asset.purchaseDate && !asset.purchasePrice && !asset.warrantyExpiryDate && (
                <p className="text-xs text-muted-foreground col-span-2">No financial data recorded.</p>
              )}
            </CardContent>
          </Card>

          {/* Atera sync data */}
          {asset.ateraAgentId && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    Atera Agent Data
                  </CardTitle>
                  <div className="text-xs text-muted-foreground">
                    {asset.ateraSyncedAt
                      ? `Synced ${formatDateTime(asset.ateraSyncedAt.toISOString())}`
                      : "Not yet synced"}
                    {asset.lastSeenAt && (
                      <span className="ml-3">
                        Last seen {formatDateTime(asset.lastSeenAt.toISOString())}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                  {ATERA_FIELDS.map(({ key, label, unit }) => {
                    const rawVal = (asset as Record<string, unknown>)[key]
                    if (rawVal == null || rawVal === "") return null
                    const isOverridden = syncOverrides[key] === true
                    const displayVal = unit ? `${rawVal} ${unit}` : String(rawVal)
                    return (
                      <div key={key}>
                        <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                          {label}
                          {isOverridden ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Pencil className="h-3 w-3 text-amber-500 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>Manually overridden — Atera sync won&apos;t overwrite this field</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <RefreshCw className="h-3 w-3 text-blue-400 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>Managed by Atera sync</TooltipContent>
                            </Tooltip>
                          )}
                        </p>
                        <p className={`text-sm font-medium ${key === "macAddress" || key === "ipAddress" ? "font-mono" : ""}`}>
                          {displayVal}
                        </p>
                      </div>
                    )
                  })}
                </div>

                {/* Disk usage bar */}
                {asset.diskUsagePercent != null && (
                  <div className="mt-4 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> Disk Usage</span>
                      <span>{asset.diskUsagePercent}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          asset.diskUsagePercent > 90 ? "bg-destructive" :
                          asset.diskUsagePercent > 75 ? "bg-amber-500" : "bg-primary"
                        }`}
                        style={{ width: `${asset.diskUsagePercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Atera Agent ID */}
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Atera Agent ID: <span className="font-mono">{asset.ateraAgentId}</span>
                    {asset.ateraDeviceGuid && (
                      <span className="ml-4">GUID: <span className="font-mono">{asset.ateraDeviceGuid}</span></span>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {asset.notes && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{asset.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Metadata footer */}
        <p className="text-xs text-muted-foreground">
          Created {formatDateTime(asset.createdAt.toISOString())}
          {" · "}Updated {formatDateTime(asset.updatedAt.toISOString())}
        </p>
      </div>
    </TooltipProvider>
  )
}
