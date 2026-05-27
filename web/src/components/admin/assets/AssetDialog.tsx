"use client"

import { useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

const CATEGORIES = [
  { value: "computer", label: "Computer" },
  { value: "screen", label: "Screen / Monitor" },
  { value: "printer", label: "Printer" },
  { value: "server", label: "Server" },
  { value: "network_equipment", label: "Network Equipment" },
  { value: "other", label: "Other" },
] as const

const STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "in_maintenance", label: "In Maintenance" },
  { value: "retired", label: "Retired" },
  { value: "disposed", label: "Disposed" },
  { value: "missing", label: "Missing" },
] as const

const schema = z.object({
  organizationId: z.string().uuid("Select a client"),
  category: z.enum(["computer", "screen", "printer", "server", "network_equipment", "other"]),
  name: z.string().min(1, "Name is required").max(255),
  make: z.string().max(100).optional().or(z.literal("")),
  model: z.string().max(255).optional().or(z.literal("")),
  serialNumber: z.string().max(255).optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "in_maintenance", "retired", "disposed", "missing"]).default("active"),
  assignedToName: z.string().max(255).optional().or(z.literal("")),
  location: z.string().max(255).optional().or(z.literal("")),
  purchaseDate: z.string().optional().or(z.literal("")),
  purchasePrice: z.coerce.number().nonnegative().optional().or(z.literal("")),
  warrantyExpiryDate: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
})
type FormData = z.infer<typeof schema>

export interface AssetItem {
  id: string
  organizationId: string
  organizationName?: string | null
  category: string
  name: string
  make: string | null
  model: string | null
  serialNumber: string | null
  status: string
  assignedToName: string | null
  location: string | null
  purchaseDate: string | null
  purchasePrice: string | null
  warrantyExpiryDate: string | null
  ateraAgentId: string | null
  notes: string | null
  syncOverrides: Record<string, boolean> | null
}

interface Props {
  open: boolean
  onClose: () => void
  asset?: AssetItem | null
  defaultOrgId?: string
}

export default function AssetDialog({ open, onClose, asset, defaultOrgId }: Props) {
  const qc = useQueryClient()

  const { data: orgsData } = useQuery({
    queryKey: ["orgs-list"],
    queryFn: () => fetch("/api/admin/clients?limit=200&active=true").then((r) => r.json()),
    enabled: open,
  })
  const orgs: { id: string; name: string }[] = orgsData?.data ?? []

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: defaultOrgId ?? "",
      category: "computer",
      name: "",
      make: "",
      model: "",
      serialNumber: "",
      status: "active",
      assignedToName: "",
      location: "",
      purchaseDate: "",
      purchasePrice: "",
      warrantyExpiryDate: "",
      notes: "",
    },
  })

  useEffect(() => {
    if (!open) return
    if (asset) {
      form.reset({
        organizationId: asset.organizationId,
        category: asset.category as FormData["category"],
        name: asset.name,
        make: asset.make ?? "",
        model: asset.model ?? "",
        serialNumber: asset.serialNumber ?? "",
        status: asset.status as FormData["status"],
        assignedToName: asset.assignedToName ?? "",
        location: asset.location ?? "",
        purchaseDate: asset.purchaseDate ?? "",
        purchasePrice: asset.purchasePrice != null ? Number(asset.purchasePrice) : "",
        warrantyExpiryDate: asset.warrantyExpiryDate ?? "",
        notes: asset.notes ?? "",
      })
    } else {
      form.reset({
        organizationId: defaultOrgId ?? "",
        category: "computer",
        name: "", make: "", model: "", serialNumber: "",
        status: "active", assignedToName: "", location: "",
        purchaseDate: "", purchasePrice: "", warrantyExpiryDate: "", notes: "",
      })
    }
  }, [open, asset, defaultOrgId, form])

  const mutation = useMutation({
    mutationFn: async (values: FormData) => {
      const payload = {
        ...values,
        make: values.make || null,
        model: values.model || null,
        serialNumber: values.serialNumber || null,
        assignedToName: values.assignedToName || null,
        location: values.location || null,
        purchaseDate: values.purchaseDate || null,
        purchasePrice: values.purchasePrice === "" || values.purchasePrice == null ? null : Number(values.purchasePrice),
        warrantyExpiryDate: values.warrantyExpiryDate || null,
        notes: values.notes || null,
      }
      const url = asset ? `/api/admin/assets/${asset.id}` : "/api/admin/assets"
      const method = asset ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed to save asset")
      return json.data
    },
    onSuccess: () => {
      toast.success(asset ? "Asset updated" : "Asset created")
      qc.invalidateQueries({ queryKey: ["assets"] })
      onClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit Asset" : "Add Asset"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            {/* Org + Category */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="organizationId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={!!asset}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Name + Status */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl><Input placeholder="DESKTOP-ABC123" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Make + Model */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="make" render={({ field }) => (
                <FormItem>
                  <FormLabel>Make</FormLabel>
                  <FormControl><Input placeholder="Dell" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="model" render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl><Input placeholder="Latitude 5440" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Serial + Assigned To */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="serialNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Serial Number</FormLabel>
                  <FormControl><Input placeholder="SN-12345" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="assignedToName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Assigned To</FormLabel>
                  <FormControl><Input placeholder="John Smith" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Location */}
            <FormField control={form.control} name="location" render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl><Input placeholder="Cape Town HQ — Desk 12" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Financial */}
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="purchaseDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="purchasePrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Price (ZAR)</FormLabel>
                  <FormControl><Input type="number" step="0.01" min="0" placeholder="0.00" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="warrantyExpiryDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Warranty Expiry</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl><Textarea placeholder="Internal notes..." rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : asset ? "Save Changes" : "Add Asset"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
