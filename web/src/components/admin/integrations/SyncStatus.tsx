"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, RotateCcw, Play, Pause } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { formatDateTime } from "@/lib/utils"

interface SyncStatusEntry {
  integrationType: "atera" | "unifi" | "uisp"
  syncEnabled: boolean
  syncIntervalMinutes: number
  status: "connected" | "error" | "disabled" | "never_synced"
  lastSyncAt: string | null
  lastErrorMessage: string | null
  consecutiveErrors: number
  circuitBroken: boolean
  circuitBrokenAt: string | null
  cachedSummary: unknown
}

interface Props {
  organizationId: string
}

const TYPE_LABELS: Record<string, string> = {
  atera: "Atera",
  unifi: "Unifi",
  uisp: "UISP",
}

const INTERVAL_OPTIONS = [
  { label: "Every 5 min", value: 5 },
  { label: "Every 15 min", value: 15 },
  { label: "Every 30 min", value: 30 },
  { label: "Every 60 min", value: 60 },
]

export default function SyncStatus({ organizationId }: Props) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ success: boolean; data: SyncStatusEntry[] }>({
    queryKey: ["sync-status", organizationId],
    queryFn: () =>
      fetch(`/api/admin/sync/status?organizationId=${organizationId}`).then((r) => r.json()),
    refetchInterval: 30_000, // Auto-refresh every 30s
  })

  const triggerMutation = useMutation({
    mutationFn: (payload: { integrationType: string; resetCircuit?: boolean }) =>
      fetch("/api/admin/sync/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...payload }),
      }).then((r) => r.json()),
    onSuccess: (_, vars) => {
      toast.success(vars.resetCircuit
        ? "Circuit reset — sync queued"
        : "Sync queued successfully"
      )
      qc.invalidateQueries({ queryKey: ["sync-status", organizationId] })
    },
    onError: () => toast.error("Failed to trigger sync"),
  })

  const settingsMutation = useMutation({
    mutationFn: (payload: { integrationType: string; syncEnabled?: boolean; syncIntervalMinutes?: number }) =>
      fetch("/api/admin/sync/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...payload }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-status", organizationId] })
    },
    onError: () => toast.error("Failed to update sync settings"),
  })

  const entries = data?.data ?? []

  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No integrations configured for this client.</p>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.integrationType}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {TYPE_LABELS[entry.integrationType] ?? entry.integrationType}
                  <StatusBadge entry={entry} />
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Enable/disable toggle */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Switch
                        checked={entry.syncEnabled}
                        onCheckedChange={(v) =>
                          settingsMutation.mutate({
                            integrationType: entry.integrationType,
                            syncEnabled: v,
                          })
                        }
                        disabled={settingsMutation.isPending}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {entry.syncEnabled ? "Disable auto-sync" : "Enable auto-sync"}
                    </TooltipContent>
                  </Tooltip>

                  {/* Interval selector */}
                  <Select
                    value={String(entry.syncIntervalMinutes)}
                    onValueChange={(v) =>
                      settingsMutation.mutate({
                        integrationType: entry.integrationType,
                        syncIntervalMinutes: parseInt(v),
                      })
                    }
                    disabled={!entry.syncEnabled || settingsMutation.isPending}
                  >
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Manual trigger */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => triggerMutation.mutate({ integrationType: entry.integrationType })}
                        disabled={triggerMutation.isPending}
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${triggerMutation.isPending ? "animate-spin" : ""}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sync now</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last sync: {entry.lastSyncAt ? formatDateTime(entry.lastSyncAt) : "Never"}
                </span>
                <span>{entry.consecutiveErrors} consecutive errors</span>
              </div>

              {entry.circuitBroken && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Circuit tripped</strong> at {entry.circuitBrokenAt ? formatDateTime(entry.circuitBrokenAt) : "unknown"}.
                    Sync paused to prevent cascading failures.{" "}
                    <button
                      className="underline font-medium"
                      onClick={() =>
                        triggerMutation.mutate({
                          integrationType: entry.integrationType,
                          resetCircuit: true,
                        })
                      }
                    >
                      Reset & retry
                    </button>
                  </AlertDescription>
                </Alert>
              )}

              {entry.lastErrorMessage && !entry.circuitBroken && (
                <p className="text-xs text-destructive truncate" title={entry.lastErrorMessage}>
                  Last error: {entry.lastErrorMessage}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  )
}

function StatusBadge({ entry }: { entry: SyncStatusEntry }) {
  if (entry.circuitBroken) {
    return <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Circuit Open</Badge>
  }
  if (!entry.syncEnabled) {
    return <Badge variant="secondary" className="text-xs"><Pause className="h-3 w-3 mr-1" />Paused</Badge>
  }
  switch (entry.status) {
    case "connected":
      return <Badge variant="success" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Syncing</Badge>
    case "error":
      return <Badge variant="destructive" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Error</Badge>
    case "never_synced":
      return <Badge variant="outline" className="text-xs"><Play className="h-3 w-3 mr-1" />Pending</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{entry.status}</Badge>
  }
}
