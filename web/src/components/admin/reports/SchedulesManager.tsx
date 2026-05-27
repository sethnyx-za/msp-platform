"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { format } from "date-fns"
import { Plus, Calendar, Trash2, Power, PowerOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface OrgOption { id: string; name: string }

interface Schedule {
  id: string
  organizationId: string
  organizationName: string | null
  frequency: "weekly" | "monthly" | "quarterly" | "on_demand"
  scheduledDay: number
  recipientUserIds: string[]
  includesSubOrgs: boolean
  isActive: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
}

interface Props {
  organizationId?: string
  orgs: OrgOption[]
}

const schema = z.object({
  organizationId: z.string().uuid("Select a client"),
  frequency: z.enum(["weekly", "monthly", "quarterly", "on_demand"]),
  scheduledDay: z.coerce.number().int().min(1).max(28),
})
type FormValues = z.infer<typeof schema>

const FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", on_demand: "On Demand",
}

export default function SchedulesManager({ organizationId, orgs }: Props) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null)
  const [loading, setLoading] = useState(false)

  const queryKey = ["report-schedules", organizationId]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (organizationId) params.set("organizationId", organizationId)
      const res = await fetch(`/api/admin/reports/schedules?${params}`)
      if (!res.ok) throw new Error("Failed to load schedules")
      return res.json() as Promise<{ data: Schedule[] }>
    },
  })

  const schedules = data?.data ?? []

  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: organizationId ?? "",
      frequency: "monthly",
      scheduledDay: 1,
    },
  })

  async function onCreate(values: FormValues) {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/reports/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to create schedule")
      toast.success("Schedule created")
      setShowCreate(false)
      reset()
      qc.invalidateQueries({ queryKey })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setLoading(false)
    }
  }

  async function onToggle(schedule: Schedule) {
    try {
      const res = await fetch(`/api/admin/reports/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !schedule.isActive }),
      })
      if (!res.ok) throw new Error()
      toast.success(schedule.isActive ? "Schedule paused" : "Schedule activated")
      qc.invalidateQueries({ queryKey })
    } catch {
      toast.error("Failed to update schedule")
    }
  }

  async function onDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/reports/schedules/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Schedule deleted")
      qc.invalidateQueries({ queryKey })
    } catch {
      toast.error("Failed to delete schedule")
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Schedule
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No schedules configured. Set one up above.</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y divide-border overflow-hidden">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {!organizationId && s.organizationName && (
                    <span className="mr-2">{s.organizationName} ·</span>
                  )}
                  {FREQ_LABELS[s.frequency]}
                  {s.frequency !== "on_demand" && (
                    <span className="text-muted-foreground font-normal ml-1">
                      — day {s.scheduledDay}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.lastRunAt
                    ? `Last run: ${format(new Date(s.lastRunAt), "dd MMM yyyy")}`
                    : "Never run"}
                  {s.nextRunAt && s.isActive && (
                    <span className="ml-2">
                      · Next: {format(new Date(s.nextRunAt), "dd MMM yyyy")}
                    </span>
                  )}
                </p>
              </div>

              <Badge variant={s.isActive ? "default" : "secondary"}>
                {s.isActive ? "Active" : "Paused"}
              </Badge>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={s.isActive ? "Pause" : "Activate"}
                onClick={() => onToggle(s)}
              >
                {s.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(s)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Report Schedule</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            {!organizationId && (
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Controller
                  name="organizationId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                      <SelectContent>
                        {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.organizationId && <p className="text-xs text-destructive">{errors.organizationId.message}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Controller
                name="frequency"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="on_demand">On Demand</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Day of Month (1–28)</Label>
              <Input type="number" min={1} max={28} {...register("scheduledDay")} />
              <p className="text-xs text-muted-foreground">
                For weekly schedules: 1=Mon, 7=Sun. For monthly/quarterly: day of month.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this report schedule. Reports already generated are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && onDelete(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
