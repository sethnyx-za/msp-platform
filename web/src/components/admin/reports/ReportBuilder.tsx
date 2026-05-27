"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const schema = z.object({
  organizationId: z.string().uuid("Please select a client"),
  title: z.string().min(1, "Title required").max(255),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
})

type FormValues = z.infer<typeof schema>

interface OrgOption { id: string; name: string }
interface Props {
  orgs: OrgOption[]
  defaultOrgId?: string
  onCreated?: (reportId: string) => void
}

export default function ReportBuilder({ orgs, defaultOrgId, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Default to last full month
  const now = new Date()
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  const toDateStr = (d: Date) => d.toISOString().split("T")[0]

  const { register, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: defaultOrgId ?? "",
      title: `Managed Services Report — ${firstOfLastMonth.toLocaleString("default", { month: "long", year: "numeric" })}`,
      periodStart: toDateStr(firstOfLastMonth),
      periodEnd: toDateStr(lastOfLastMonth),
    },
  })

  const orgId = watch("organizationId")

  async function onSubmit(values: FormValues) {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to create report")

      const reportId = json.data.id
      toast.success("Report created — queuing PDF generation…")

      // Immediately trigger generation
      await fetch(`/api/admin/reports/${reportId}/generate`, { method: "POST" })

      setOpen(false)
      reset()

      if (onCreated) {
        onCreated(reportId)
      } else {
        router.push(`/admin/reports/${reportId}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create report")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Report
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Report</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Client */}
          <div className="space-y-1.5">
            <Label>Client Organisation</Label>
            {defaultOrgId ? (
              <p className="text-sm text-muted-foreground">
                {orgs.find((o) => o.id === defaultOrgId)?.name ?? defaultOrgId}
              </p>
            ) : (
              <Select
                value={orgId}
                onValueChange={(v) => setValue("organizationId", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client…" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.organizationId && (
              <p className="text-xs text-destructive">{errors.organizationId.message}</p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Report Title</Label>
            <Input id="title" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          {/* Period */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="periodStart">Period Start</Label>
              <Input id="periodStart" type="date" {...register("periodStart")} />
              {errors.periodStart && (
                <p className="text-xs text-destructive">{errors.periodStart.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periodEnd">Period End</Label>
              <Input id="periodEnd" type="date" {...register("periodEnd")} />
              {errors.periodEnd && (
                <p className="text-xs text-destructive">{errors.periodEnd.message}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating…" : "Create & Generate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
