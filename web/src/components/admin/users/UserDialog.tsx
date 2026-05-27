"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { Eye, EyeOff } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

const USER_ROLES = ["msp_super_admin", "msp_technician", "client_admin", "client_approver", "client_user"] as const

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, "Must include upper, lower, digit & special char"),
  name: z.string().max(100).optional().or(z.literal("")),
  organizationId: z.string().min(1, "Organisation is required"),
  role: z.enum(USER_ROLES),
  isMspStaff: z.boolean().optional(),
  mustChangePwd: z.boolean().optional(),
})

const editSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().max(100).optional().or(z.literal("")),
  isMspStaff: z.boolean().optional(),
  mustChangePwd: z.boolean().optional(),
})

type CreateFormData = z.infer<typeof createSchema>
type EditFormData = z.infer<typeof editSchema>

interface User {
  id: string
  email: string
  name: string | null
  isMspStaff: boolean
  isActive: boolean
  mustChangePwd: boolean
  memberships: Array<{ organizationId: string; role: string; isPrimary: boolean; organization: { id: string; name: string } }>
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editTarget: User | null
  onSuccess: () => void
}

export default function UserDialog({ open, onOpenChange, editTarget, onSuccess }: Props) {
  const isEdit = !!editTarget
  const [showPwd, setShowPwd] = useState(false)

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", password: "", name: "", organizationId: "", role: "client_user", isMspStaff: false, mustChangePwd: true },
  })

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: { email: "", name: "", isMspStaff: false, mustChangePwd: false },
  })

  // Load orgs for the selector
  const { data: orgsData } = useQuery({
    queryKey: ["admin-clients-all"],
    queryFn: () => fetch("/api/admin/clients?limit=200").then((r) => r.json()),
    enabled: open && !isEdit,
  })
  const orgs = orgsData?.data ?? []

  useEffect(() => {
    if (open) {
      if (editTarget) {
        const primary = editTarget.memberships.find((m) => m.isPrimary) ?? editTarget.memberships[0]
        editForm.reset({
          email: editTarget.email,
          name: editTarget.name ?? "",
          isMspStaff: editTarget.isMspStaff,
          mustChangePwd: editTarget.mustChangePwd,
        })
      } else {
        createForm.reset({ email: "", password: "", name: "", organizationId: "", role: "client_user", isMspStaff: false, mustChangePwd: true })
      }
    }
  }, [open, editTarget])

  const createMutation = useMutation({
    mutationFn: async (data: CreateFormData) => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, name: data.name || null }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed")
      return json.data
    },
    onSuccess: () => { toast.success("User created"); onSuccess(); onOpenChange(false) },
    onError: (err: Error) => toast.error(err.message),
  })

  const editMutation = useMutation({
    mutationFn: async (data: EditFormData) => {
      const res = await fetch(`/api/admin/users/${editTarget!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, name: data.name || null }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed")
      return json.data
    },
    onSuccess: () => { toast.success("User updated"); onSuccess(); onOpenChange(false) },
    onError: (err: Error) => toast.error(err.message),
  })

  const isMspRole = (role: string) => role === "msp_super_admin" || role === "msp_technician"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Add User"}</DialogTitle>
        </DialogHeader>

        {isEdit ? (
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((d) => editMutation.mutate(d))} className="space-y-4">
              <FormField control={editForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl><Input placeholder="Jane Smith" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="isMspStaff" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-base">MSP Staff</FormLabel>
                    <FormDescription>Grants access to the MSP admin portal</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <FormField control={editForm.control} name="mustChangePwd" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="text-base">Force Password Change</FormLabel>
                    <FormDescription>User must change password on next login</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={editMutation.isPending}>
                  {editMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={createForm.control} name="email" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Email *</FormLabel>
                    <FormControl><Input type="email" placeholder="jane@acme.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={createForm.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input placeholder="Jane Smith" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={createForm.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Password *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type={showPwd ? "text" : "password"} placeholder="Temp password" {...field} className="pr-10" />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPwd((v) => !v)}>
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={createForm.control} name="organizationId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Organisation *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select organisation" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {orgs.map((o: { id: string; name: string }) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={createForm.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v)
                      createForm.setValue("isMspStaff", isMspRole(v))
                    }}
                  >
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="msp_super_admin">MSP Super Admin</SelectItem>
                      <SelectItem value="msp_technician">MSP Technician</SelectItem>
                      <SelectItem value="client_admin">Client Admin</SelectItem>
                      <SelectItem value="client_approver">Client Approver</SelectItem>
                      <SelectItem value="client_user">Client User</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
