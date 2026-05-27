"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  address: z.string().max(255).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  parentId: z.string().nullable().optional(),
  isMaster: z.boolean().optional(),
  slaHoursResponse: z.coerce.number().int().min(1).max(168).nullable().optional(),
  slaHoursResolution: z.coerce.number().int().min(1).max(720).nullable().optional(),
})

type FormData = z.infer<typeof schema>

interface Organization {
  id: string
  name: string
  slug: string
  parentId: string | null
  isMaster: boolean
  isActive: boolean
  address: string | null
  phone: string | null
  website: string | null
  slaHoursResponse: number | null
  slaHoursResolution: number | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editTarget: Organization | null
  onSuccess: () => void
}

export default function ClientDialog({ open, onOpenChange, editTarget, onSuccess }: Props) {
  const isEdit = !!editTarget

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      website: "",
      parentId: null,
      isMaster: false,
      slaHoursResponse: null,
      slaHoursResolution: null,
    },
  })

  // Load master clients for parent selector
  const { data: mastersData } = useQuery({
    queryKey: ["admin-clients-masters"],
    queryFn: () => fetch("/api/admin/clients?limit=100").then((r) => r.json()),
    enabled: open,
  })

  const masterClients = (mastersData?.data ?? []).filter((c: Organization) => c.isMaster && c.isActive)

  useEffect(() => {
    if (open) {
      if (editTarget) {
        form.reset({
          name: editTarget.name,
          address: editTarget.address ?? "",
          phone: editTarget.phone ?? "",
          website: editTarget.website ?? "",
          parentId: editTarget.parentId,
          isMaster: editTarget.isMaster,
          slaHoursResponse: editTarget.slaHoursResponse,
          slaHoursResolution: editTarget.slaHoursResolution,
        })
      } else {
        form.reset({
          name: "",
          address: "",
          phone: "",
          website: "",
          parentId: null,
          isMaster: false,
          slaHoursResponse: null,
          slaHoursResolution: null,
        })
      }
    }
  }, [open, editTarget, form])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        address: data.address || null,
        phone: data.phone || null,
        website: data.website || null,
        parentId: data.parentId || null,
        slaHoursResponse: data.slaHoursResponse || null,
        slaHoursResolution: data.slaHoursResolution || null,
      }

      const url = isEdit ? `/api/admin/clients/${editTarget!.id}` : "/api/admin/clients"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed")
      return json.data
    },
    onSuccess: () => {
      toast.success(isEdit ? "Client updated" : "Client created")
      onSuccess()
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Client" : "Add Client"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name *</FormLabel>
                  <FormControl><Input placeholder="Acme Corp" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input placeholder="+27 21 000 0000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl><Input placeholder="https://acme.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl><Input placeholder="123 Main St, Cape Town" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Parent org selector — only relevant if not a master */}
            <FormField
              control={form.control}
              name="isMaster"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-base">Master Organisation</FormLabel>
                    <p className="text-sm text-muted-foreground">Can have child branches linked to it</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {!form.watch("isMaster") && masterClients.length > 0 && (
              <FormField
                control={form.control}
                name="parentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Organisation</FormLabel>
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="None (standalone)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None (standalone)</SelectItem>
                        {masterClients.map((c: Organization) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="slaHoursResponse"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SLA Response (hours)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="4"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slaHoursResolution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SLA Resolution (hours)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="24"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Client"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
