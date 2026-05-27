"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CheckCircle2, XCircle, RefreshCw, Wifi, WifiOff, Trash2, Link2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { toast } from "sonner"

const schema = z.object({
  apiKey: z.string().min(10, "API key is required"),
  fabricId: z.string().optional(),
  fabricName: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface UnifiSite {
  id: string
  name: string
  isOnline?: boolean
  deviceCount?: number
  clientCount?: number
}

interface UnifiData {
  configured: boolean
  connected: boolean
  error?: string
  siteCount?: number
  fabricId?: string
  fabricName?: string
  sites: UnifiSite[]
  mappings: Array<{ id: string; unifiSiteId: string; unifiSiteName: string; fabricId?: string }>
}

interface Props {
  organizationId: string
  organizationName: string
}

export default function UnifiConfig({ organizationId, organizationName }: Props) {
  const qc = useQueryClient()
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [selectedSite, setSelectedSite] = useState("")

  const { data, isLoading, refetch } = useQuery<{ success: boolean; data: UnifiData }>({
    queryKey: ["unifi-config", organizationId],
    queryFn: () =>
      fetch(`/api/admin/integrations/unifi?organizationId=${organizationId}`).then((r) => r.json()),
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { apiKey: "", fabricId: "", fabricName: "" },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      const res = await fetch("/api/admin/integrations/unifi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...values }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed")
      return json.data
    },
    onSuccess: () => {
      toast.success("Unifi Fabric API key saved and verified")
      qc.invalidateQueries({ queryKey: ["unifi-config", organizationId] })
      form.reset()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const removeMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/admin/integrations/unifi?organizationId=${organizationId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Unifi configuration removed")
      qc.invalidateQueries({ queryKey: ["unifi-config", organizationId] })
      setRemoveDialogOpen(false)
    },
    onError: () => toast.error("Failed to remove Unifi configuration"),
  })

  const mapSiteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSite) return
      const site = unifi?.sites.find((s) => s.id === selectedSite)
      if (!site) return
      const res = await fetch("/api/admin/integrations/unifi?action=map-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          unifiSiteId: site.id,
          unifiSiteName: site.name,
          fabricId: unifi?.fabricId,
          fabricName: unifi?.fabricName,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed")
    },
    onSuccess: () => {
      toast.success("Site mapped")
      qc.invalidateQueries({ queryKey: ["unifi-config", organizationId] })
      setSelectedSite("")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const unifi = data?.data

  if (isLoading) return <Skeleton className="h-48 w-full" />

  const mappedSiteIds = new Set(unifi?.mappings?.map((m) => m.unifiSiteId) ?? [])
  const unmappedSites = unifi?.sites?.filter((s) => !mappedSiteIds.has(s.id)) ?? []

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Unifi Site Manager
                {unifi?.configured && unifi.connected ? (
                  <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>
                ) : unifi?.configured ? (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Error</Badge>
                ) : (
                  <Badge variant="outline">Not configured</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Per-client Fabric API key for {organizationName}. Each Fabric scopes to a customer group.
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {unifi?.configured && unifi.error && (
            <Alert variant="destructive">
              <AlertDescription>{unifi.error}</AlertDescription>
            </Alert>
          )}

          {!unifi?.configured ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
                <FormField control={form.control} name="apiKey" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fabric API Key *</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Paste API key from Unifi Site Manager..." {...field} />
                    </FormControl>
                    <FormDescription>
                      In Unifi Site Manager → Settings → API → Create API Key, scoped to this client's Fabric.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="fabricId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fabric ID (optional)</FormLabel>
                      <FormControl><Input placeholder="For reference only" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="fabricName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fabric Name (optional)</FormLabel>
                      <FormControl><Input placeholder="e.g. Acme Holdings" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Testing & Saving..." : "Save & Test Connection"}
                </Button>
              </form>
            </Form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {unifi.connected ? `${unifi.siteCount} sites available` : "Connection failed"}
                  </p>
                  {unifi.fabricName && (
                    <p className="text-xs text-muted-foreground">Fabric: {unifi.fabricName}</p>
                  )}
                  {unifi.fabricId && (
                    <p className="text-xs text-muted-foreground font-mono">ID: {unifi.fabricId}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setRemoveDialogOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </Button>
              </div>

              {/* Mapped sites */}
              {unifi.mappings && unifi.mappings.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Mapped Sites</p>
                  <div className="space-y-1">
                    {unifi.mappings.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-sm text-muted-foreground rounded border px-3 py-1.5">
                        <Wifi className="h-3.5 w-3.5" />
                        {m.unifiSiteName}
                        <span className="font-mono text-xs opacity-60">{m.unifiSiteId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Map new site */}
              {unifi.connected && unmappedSites.length > 0 && (
                <div className="flex gap-2">
                  <Select value={selectedSite} onValueChange={setSelectedSite}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Map a Unifi site..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unmappedSites.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="flex items-center gap-2">
                            {s.isOnline !== false ? <Wifi className="h-3.5 w-3.5 text-green-500" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
                            {s.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => mapSiteMutation.mutate()}
                    disabled={!selectedSite || mapSiteMutation.isPending}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Map Site
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Unifi configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the Fabric API key for {organizationName}. Site status and device data will no longer sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => removeMutation.mutate()}
            >Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
