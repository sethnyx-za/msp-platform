"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { CheckCircle2, XCircle, RefreshCw, Link2, Unlink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "sonner"

interface AteraCustomer {
  CustomerID: number
  CustomerName: string
}

interface AteraMapping {
  id: string
  ateraCustomerId: number
  ateraCustomerName: string
  organizationId: string
}

interface AteraData {
  connected: boolean
  error?: string
  customerCount?: number
  customers: AteraCustomer[]
  mappings: AteraMapping[]
}

interface Props {
  organizationId: string
  organizationName: string
}

export default function AteraConfig({ organizationId, organizationName }: Props) {
  const qc = useQueryClient()
  const [selectedCustomer, setSelectedCustomer] = useState<string>("")

  const { data, isLoading, refetch } = useQuery<{ success: boolean; data: AteraData }>({
    queryKey: ["atera-config", organizationId],
    queryFn: () =>
      fetch(`/api/admin/integrations/atera?organizationId=${organizationId}`).then((r) => r.json()),
  })

  const mapMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer) return
      const customer = data?.data.customers.find((c) => String(c.CustomerID) === selectedCustomer)
      if (!customer) return

      const res = await fetch("/api/admin/integrations/atera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          ateraCustomerId: customer.CustomerID,
          ateraCustomerName: customer.CustomerName,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed")
    },
    onSuccess: () => {
      toast.success("Atera customer mapped")
      qc.invalidateQueries({ queryKey: ["atera-config", organizationId] })
      setSelectedCustomer("")
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const unmapMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/admin/integrations/atera?organizationId=${organizationId}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Atera mapping removed")
      qc.invalidateQueries({ queryKey: ["atera-config", organizationId] })
    },
    onError: () => toast.error("Failed to remove mapping"),
  })

  const atera = data?.data

  if (isLoading) return <Skeleton className="h-32 w-full" />

  const existingMapping = atera?.mappings?.[0]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Atera
              {atera?.connected ? (
                <Badge variant="success"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>
              ) : (
                <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Not connected</Badge>
              )}
            </CardTitle>
            <CardDescription>Map {organizationName} to an Atera customer for ticket creation and agent sync</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!atera?.connected && atera?.error && (
          <Alert variant="destructive">
            <AlertDescription>
              Atera API key not configured or invalid. Set <code>ATERA_API_KEY</code> in your environment.
              {atera.error && <span className="block text-xs mt-1">{atera.error}</span>}
            </AlertDescription>
          </Alert>
        )}

        {atera?.connected && (
          <>
            <p className="text-sm text-muted-foreground">{atera.customerCount} customers available in Atera</p>

            {existingMapping ? (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Mapped to: {existingMapping.ateraCustomerName}</p>
                  <p className="text-xs text-muted-foreground">Atera Customer ID: {existingMapping.ateraCustomerId}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => unmapMutation.mutate()}
                  disabled={unmapMutation.isPending}
                >
                  <Unlink className="h-4 w-4 mr-2" />
                  Unmap
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select Atera customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {atera.customers.map((c) => (
                      <SelectItem key={c.CustomerID} value={String(c.CustomerID)}>
                        {c.CustomerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => mapMutation.mutate()}
                  disabled={!selectedCustomer || mapMutation.isPending}
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Map
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
