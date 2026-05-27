"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CheckCircle2, XCircle, RefreshCw, Trash2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { toast } from "sonner"

const schema = z.object({
  host: z.string().min(3, "Host is required"),
  apiToken: z.string().min(10, "API token is required"),
  useTls: z.boolean(),
})
type FormData = z.infer<typeof schema>

interface UispData {
  configured: boolean
  connected: boolean
  error?: string
  host?: string
  useTls?: boolean
  deviceCount?: number
}

interface Props {
  organizationId: string
  organizationName: string
}

export default function UispConfig({ organizationId, organizationName }: Props) {
  const qc = useQueryClient()
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)

  const { data, isLoading, refetch } = useQuery<{ success: boolean; data: UispData }>({
    queryKey: ["uisp-config", organizationId],
    queryFn: () =>
      fetch(`/api/admin/integrations/uisp?organizationId=${organizationId}`).then((r) => r.json()),
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { host: "", apiToken: "", useTls: true },
  })

  const saveMutation = useMutation({
    mutationFn: async (values: FormData) => {
      const res = await fetch("/api/admin/integrations/uisp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...values }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed")
      return json.data
    },
    onSuccess: () => {
      toast.success("UISP configuration saved and verified")
      qc.invalidateQueries({ queryKey: ["uisp-config", organizationId] })
      form.reset()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const removeMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/admin/integrations/uisp?organizationId=${organizationId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("UISP configuration removed")
      qc.invalidateQueries({ queryKey: ["uisp-config", organizationId] })
      setRemoveDialogOpen(false)
    },
    onError: () => toast.error("Failed to remove UISP configuration"),
  })

  const uisp = data?.data
  if (isLoading) return <Skeleton className="h-40 w-full" />

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                UISP
                {uisp?.configured && uisp.connected ? (
                  <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>
                ) : uisp?.configured ? (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Error</Badge>
                ) : (
                  <Badge variant="outline">Not configured</Badge>
                )}
              </CardTitle>
              <CardDescription>UISP (Ubiquiti ISP) for ISP-grade device monitoring — {organizationName}</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {uisp?.configured && uisp.error && (
            <Alert variant="destructive">
              <AlertDescription>{uisp.error}</AlertDescription>
            </Alert>
          )}

          {!uisp?.configured ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
                <FormField control={form.control} name="host" render={({ field }) => (
                  <FormItem>
                    <FormLabel>UISP Host *</FormLabel>
                    <FormControl><Input placeholder="uisp.yourmsp.com" {...field} /></FormControl>
                    <FormDescription>Hostname of your self-hosted UISP instance (no https:// prefix)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="apiToken" render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Token *</FormLabel>
                    <FormControl><Input type="password" placeholder="API token from UISP → Settings → API" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="useTls" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel className="text-base">Use HTTPS (TLS)</FormLabel>
                      <FormDescription>Disable only for local non-TLS instances</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Testing & Saving..." : "Save & Test Connection"}
                </Button>
              </form>
            </Form>
          ) : (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {uisp.connected ? `${uisp.deviceCount} devices found` : "Connection error"}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {uisp.useTls ? "https" : "http"}://{uisp.host}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRemoveDialogOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove UISP configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              Device data from UISP will no longer sync for {organizationName}.
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
