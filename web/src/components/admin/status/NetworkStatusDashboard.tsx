"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import {
  Wifi, Server, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, Clock, Activity, Globe,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { formatDateTime } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface IntegrationConfig {
  syncEnabled: boolean
  status: string
  lastSyncAt: string | null
  lastErrorMessage: string | null
  consecutiveErrors: number
  circuitBroken: boolean
}

interface CacheEntry<T> {
  data: T
  syncedAt: string
}

interface UnifiSummary {
  totalSites: number
  onlineSites: number
  offlineSites: number
  deviceCount: number
}

interface UnifiSite {
  id?: string
  siteId?: string
  name?: string
  status?: string
  deviceCount?: number
}

interface UispSummary {
  deviceCount: number
  onlineDevices: number
  offlineDevices: number
  siteCount: number
  syncedAt: string
}

interface UispDevice {
  identification?: { id?: string; name?: string; type?: string }
  overview?: { status?: string; ipAddress?: string }
  id?: string
  name?: string
  type?: string
  status?: string
  ipAddress?: string
}

interface StatusData {
  unifi: {
    config: IntegrationConfig
    summary: CacheEntry<UnifiSummary> | null
    sites: CacheEntry<UnifiSite[]> | null
  } | null
  uisp: {
    config: IntegrationConfig
    summary: CacheEntry<UispSummary> | null
    devices: CacheEntry<UispDevice[]> | null
    sites: CacheEntry<unknown[]> | null
  } | null
}

interface OrgOption { id: string; name: string }

interface Props {
  initialOrgId?: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NetworkStatusDashboard({ initialOrgId }: Props) {
  const [selectedOrgId, setSelectedOrgId] = useState(initialOrgId ?? "")

  const { data: orgsData } = useQuery({
    queryKey: ["orgs-list-status"],
    queryFn: () => fetch("/api/admin/clients?limit=200&active=true").then((r) => r.json()),
  })
  const orgs: OrgOption[] = orgsData?.data ?? []

  const { data, isLoading, refetch } = useQuery<{ success: boolean; data: StatusData }>({
    queryKey: ["network-status", selectedOrgId],
    queryFn: () => fetch(`/api/admin/status?organizationId=${selectedOrgId}`).then((r) => r.json()),
    enabled: !!selectedOrgId,
    refetchInterval: 60_000,
  })

  const triggerMutation = useMutation({
    mutationFn: (integrationType: string) =>
      fetch("/api/admin/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: selectedOrgId, integrationType }),
      }).then((r) => r.json()),
    onSuccess: (_, type) => {
      toast.success(`${type} sync queued`)
      setTimeout(() => refetch(), 3000)
    },
    onError: () => toast.error("Failed to trigger sync"),
  })

  const status = data?.data

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Org selector (when not locked to a specific org) */}
        {!initialOrgId && (
          <div className="flex items-center gap-3">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={selectedOrgId || ""} onValueChange={setSelectedOrgId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select a client to view status..." />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOrgId && (
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            )}
          </div>
        )}

        {!selectedOrgId && (
          <div className="text-center py-16 text-muted-foreground">
            <Activity className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p>Select a client to view their network status.</p>
          </div>
        )}

        {selectedOrgId && isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {selectedOrgId && !isLoading && status && (
          <>
            {/* No integrations */}
            {!status.unifi && !status.uisp && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  No network integrations (Unifi / UISP) are configured for this client.
                  Configure them on the client&apos;s Integrations tab.
                </AlertDescription>
              </Alert>
            )}

            {/* Unifi Section */}
            {status.unifi && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-primary" />
                    Unifi Network
                    <ConfigStatusBadge config={status.unifi.config} />
                  </h3>
                  <div className="flex items-center gap-2">
                    {status.unifi.summary && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(status.unifi.summary.syncedAt)}
                      </span>
                    )}
                    <Button
                      variant="outline" size="sm"
                      onClick={() => triggerMutation.mutate("unifi")}
                      disabled={triggerMutation.isPending}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${triggerMutation.isPending ? "animate-spin" : ""}`} />
                      Sync
                    </Button>
                  </div>
                </div>

                {status.unifi.config.circuitBroken && (
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Circuit breaker tripped. Sync paused — go to the Sync tab to reset.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Summary cards */}
                {status.unifi.summary && (
                  <div className="grid grid-cols-4 gap-3">
                    <StatCard label="Total Sites" value={status.unifi.summary.data.totalSites ?? 0} />
                    <StatCard label="Online" value={status.unifi.summary.data.onlineSites ?? 0} variant="success" />
                    <StatCard label="Offline" value={status.unifi.summary.data.offlineSites ?? 0} variant={status.unifi.summary.data.offlineSites > 0 ? "destructive" : "default"} />
                    <StatCard label="Devices" value={status.unifi.summary.data.deviceCount ?? 0} />
                  </div>
                )}

                {/* Sites table */}
                {status.unifi.sites && (status.unifi.sites.data as UnifiSite[]).length > 0 && (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Site Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Devices</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(status.unifi.sites.data as UnifiSite[]).map((site, i) => (
                          <TableRow key={site.id ?? site.siteId ?? i}>
                            <TableCell className="font-medium text-sm">{site.name ?? site.siteId ?? "—"}</TableCell>
                            <TableCell><SiteStatusBadge status={site.status} /></TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {site.deviceCount ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {status.unifi.summary === null && !status.unifi.config.circuitBroken && (
                  <p className="text-sm text-muted-foreground">
                    No cached data yet. Trigger a sync to populate status.
                  </p>
                )}
              </div>
            )}

            {/* UISP Section */}
            {status.uisp && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />
                    UISP
                    <ConfigStatusBadge config={status.uisp.config} />
                  </h3>
                  <div className="flex items-center gap-2">
                    {status.uisp.summary && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(status.uisp.summary.syncedAt)}
                      </span>
                    )}
                    <Button
                      variant="outline" size="sm"
                      onClick={() => triggerMutation.mutate("uisp")}
                      disabled={triggerMutation.isPending}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${triggerMutation.isPending ? "animate-spin" : ""}`} />
                      Sync
                    </Button>
                  </div>
                </div>

                {status.uisp.config.circuitBroken && (
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Circuit breaker tripped. Sync paused — go to the Sync tab to reset.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Summary cards */}
                {status.uisp.summary && (
                  <div className="grid grid-cols-4 gap-3">
                    <StatCard label="Total Devices" value={status.uisp.summary.data.deviceCount ?? 0} />
                    <StatCard label="Online" value={status.uisp.summary.data.onlineDevices ?? 0} variant="success" />
                    <StatCard label="Offline" value={status.uisp.summary.data.offlineDevices ?? 0} variant={status.uisp.summary.data.offlineDevices > 0 ? "destructive" : "default"} />
                    <StatCard label="Sites" value={status.uisp.summary.data.siteCount ?? 0} />
                  </div>
                )}

                {/* Devices table */}
                {status.uisp.devices && (status.uisp.devices.data as UispDevice[]).length > 0 && (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Device</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>IP Address</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(status.uisp.devices.data as UispDevice[]).slice(0, 100).map((device, i) => {
                          const name = device.identification?.name ?? device.name ?? "—"
                          const type = device.identification?.type ?? device.type ?? "—"
                          const devStatus = device.overview?.status ?? device.status ?? ""
                          const ip = device.overview?.ipAddress ?? device.ipAddress ?? "—"
                          return (
                            <TableRow key={device.identification?.id ?? device.id ?? i}>
                              <TableCell className="font-medium text-sm">{name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground capitalize">{type}</TableCell>
                              <TableCell><DeviceStatusBadge status={devStatus} /></TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{ip}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                    {(status.uisp.devices.data as UispDevice[]).length > 100 && (
                      <p className="text-xs text-muted-foreground p-3 border-t">
                        Showing first 100 of {(status.uisp.devices.data as UispDevice[]).length} devices.
                      </p>
                    )}
                  </div>
                )}

                {status.uisp.summary === null && !status.uisp.config.circuitBroken && (
                  <p className="text-sm text-muted-foreground">
                    No cached data yet. Trigger a sync to populate status.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, variant = "default",
}: {
  label: string
  value: number
  variant?: "default" | "success" | "destructive"
}) {
  const textColor =
    variant === "success" ? "text-green-600 dark:text-green-400" :
    variant === "destructive" ? "text-red-600 dark:text-red-400" :
    "text-foreground"

  return (
    <Card className="py-3">
      <CardContent className="px-4 py-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function ConfigStatusBadge({ config }: { config: IntegrationConfig }) {
  if (config.circuitBroken) {
    return <Badge variant="destructive" className="text-xs">Circuit Open</Badge>
  }
  if (!config.syncEnabled) {
    return <Badge variant="secondary" className="text-xs">Paused</Badge>
  }
  if (config.status === "connected") {
    return <Badge variant="success" className="text-xs">Syncing</Badge>
  }
  if (config.status === "error") {
    return <Badge variant="destructive" className="text-xs">Error</Badge>
  }
  return <Badge variant="outline" className="text-xs">Pending</Badge>
}

function SiteStatusBadge({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase()
  if (s === "online" || s === "active" || s === "connected") {
    return (
      <Badge variant="success" className="text-xs gap-1">
        <CheckCircle2 className="h-3 w-3" /> Online
      </Badge>
    )
  }
  if (s === "offline" || s === "disconnected") {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <XCircle className="h-3 w-3" /> Offline
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-xs capitalize">{status ?? "Unknown"}</Badge>
}

function DeviceStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  if (s === "active" || s === "online" || s === "connected") {
    return (
      <Badge variant="success" className="text-xs gap-1">
        <CheckCircle2 className="h-3 w-3" /> Online
      </Badge>
    )
  }
  if (s === "inactive" || s === "offline" || s === "disconnected") {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <XCircle className="h-3 w-3" /> Offline
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-xs capitalize">{status || "Unknown"}</Badge>
}
