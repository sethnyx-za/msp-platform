"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Trash2, MapPin, FolderOpen, Ticket, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"

interface Props { organizationId: string; organizationName: string }

// ─── Locations section ────────────────────────────────────────────────────────

const locSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional().or(z.literal("")),
})
type LocForm = z.infer<typeof locSchema>

function LocationsSection({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-locations", organizationId],
    queryFn: () => fetch(`/api/admin/onboarding/locations?organizationId=${organizationId}`).then((r) => r.json()),
  })
  const items = data?.data ?? []

  const form = useForm<LocForm>({ resolver: zodResolver(locSchema), defaultValues: { name: "", description: "" } })

  const saveMutation = useMutation({
    mutationFn: async (values: LocForm) => {
      const url = editId ? `/api/admin/onboarding/locations/${editId}` : "/api/admin/onboarding/locations"
      const method = editId ? "PATCH" : "POST"
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, organizationId, description: values.description || null }),
      })
      return res.json()
    },
    onSuccess: (json) => {
      if (!json.success) { toast.error(json.error ?? "Failed"); return }
      toast.success(editId ? "Location updated" : "Location added")
      qc.invalidateQueries({ queryKey: ["onboarding-locations", organizationId] })
      setOpen(false); setEditId(null); form.reset()
    },
    onError: () => toast.error("Failed to save"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/onboarding/locations/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { toast.success("Location removed"); qc.invalidateQueries({ queryKey: ["onboarding-locations", organizationId] }) },
    onError: () => toast.error("Failed to remove"),
  })

  const openEdit = (item: { id: string; name: string; description: string | null }) => {
    setEditId(item.id)
    form.reset({ name: item.name, description: item.description ?? "" })
    setOpen(true)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Building Access Locations
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Locations shown to clients in the onboarding form for access requests.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditId(null); form.reset(); setOpen(true) }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20 w-full" /> : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No locations configured yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item: any) => (
              <li key={item.id} className="flex items-center gap-2 group">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                </div>
                {!item.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(item)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setEditId(null); form.reset() } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl><Input placeholder="Cape Town HQ" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input placeholder="Main office building" {...field} /></FormControl>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending}>Save</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ─── Resources section ────────────────────────────────────────────────────────

function ResourcesSection({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-resources", organizationId],
    queryFn: () => fetch(`/api/admin/onboarding/resources?organizationId=${organizationId}`).then((r) => r.json()),
  })
  const items = data?.data ?? []

  const form = useForm<LocForm>({ resolver: zodResolver(locSchema), defaultValues: { name: "", description: "" } })

  const saveMutation = useMutation({
    mutationFn: async (values: LocForm) => {
      const url = editId ? `/api/admin/onboarding/resources/${editId}` : "/api/admin/onboarding/resources"
      const method = editId ? "PATCH" : "POST"
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, organizationId, description: values.description || null }),
      })
      return res.json()
    },
    onSuccess: (json) => {
      if (!json.success) { toast.error(json.error ?? "Failed"); return }
      toast.success(editId ? "Resource updated" : "Resource added")
      qc.invalidateQueries({ queryKey: ["onboarding-resources", organizationId] })
      setOpen(false); setEditId(null); form.reset()
    },
    onError: () => toast.error("Failed to save"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/onboarding/resources/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { toast.success("Resource removed"); qc.invalidateQueries({ queryKey: ["onboarding-resources", organizationId] }) },
    onError: () => toast.error("Failed to remove"),
  })

  const openEdit = (item: { id: string; name: string; description: string | null }) => {
    setEditId(item.id)
    form.reset({ name: item.name, description: item.description ?? "" })
    setOpen(true)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FolderOpen className="h-4 w-4" /> Shared Resources
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              File shares, drives, applications and printers available for new starters.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditId(null); form.reset(); setOpen(true) }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-20 w-full" /> : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shared resources configured yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item: any) => (
              <li key={item.id} className="flex items-center gap-2 group">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.name}</p>
                  {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(item)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setEditId(null); form.reset() } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Resource" : "Add Shared Resource"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-3">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl><Input placeholder="Finance Drive (\\server\Finance)" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input placeholder="Shared accounting documents" {...field} /></FormControl>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending}>Save</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ─── Ticket Config section ────────────────────────────────────────────────────

const ticketSchema = z.object({
  ticketTitleTemplate: z.string().min(1).max(500),
  ticketPriority: z.enum(["low", "medium", "high", "critical"]),
  ateraAssigneeTechnicianId: z.string().optional().or(z.literal("")),
  ateraAssigneeName: z.string().optional().or(z.literal("")),
})
type TicketForm = z.infer<typeof ticketSchema>

function TicketConfigSection() {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ["ticket-config"],
    queryFn: () => fetch("/api/admin/onboarding/ticket-config").then((r) => r.json()),
  })
  const config = data?.data

  const form = useForm<TicketForm>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      ticketTitleTemplate: config?.ticketTitleTemplate ?? "New Starter Onboarding: {{starter_name}}",
      ticketPriority: config?.ticketPriority ?? "medium",
      ateraAssigneeTechnicianId: config?.ateraAssigneeTechnicianId ?? "",
      ateraAssigneeName: config?.ateraAssigneeName ?? "",
    },
    values: config ? {
      ticketTitleTemplate: config.ticketTitleTemplate ?? "New Starter Onboarding: {{starter_name}}",
      ticketPriority: config.ticketPriority ?? "medium",
      ateraAssigneeTechnicianId: config.ateraAssigneeTechnicianId ?? "",
      ateraAssigneeName: config.ateraAssigneeName ?? "",
    } : undefined,
  })

  const saveMutation = useMutation({
    mutationFn: (values: TicketForm) =>
      fetch("/api/admin/onboarding/ticket-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          ateraAssigneeTechnicianId: values.ateraAssigneeTechnicianId || null,
          ateraAssigneeName: values.ateraAssigneeName || null,
        }),
      }).then((r) => r.json()),
    onSuccess: (json) => {
      if (!json.success) { toast.error(json.error ?? "Failed"); return }
      toast.success("Ticket config saved")
      qc.invalidateQueries({ queryKey: ["ticket-config"] })
    },
    onError: () => toast.error("Failed to save"),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Ticket className="h-4 w-4" /> Atera Ticket Configuration
        </CardTitle>
        <CardDescription className="text-xs">
          Configure how tickets are created in Atera when an onboarding is approved.
          Use <code className="bg-muted px-1 rounded">{"{{starter_name}}"}</code> in the title template.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
            <FormField control={form.control} name="ticketTitleTemplate" render={({ field }) => (
              <FormItem>
                <FormLabel>Ticket Title Template</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="ticketPriority" render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="ateraAssigneeTechnicianId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Assignee Technician ID</FormLabel>
                  <FormControl><Input placeholder="Atera technician ID" {...field} /></FormControl>
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="ateraAssigneeName" render={({ field }) => (
              <FormItem>
                <FormLabel>Assignee Name (display only)</FormLabel>
                <FormControl><Input placeholder="John Technician" {...field} /></FormControl>
              </FormItem>
            )} />
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingSettings({ organizationId, organizationName }: Props) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure onboarding options for <strong>{organizationName}</strong>. These appear in the client&apos;s onboarding form.
      </p>
      <LocationsSection organizationId={organizationId} />
      <ResourcesSection organizationId={organizationId} />
      <TicketConfigSection />
    </div>
  )
}
