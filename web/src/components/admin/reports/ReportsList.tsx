"use client"

import { useState, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  FileBarChart2, Download, Trash2, RefreshCw, Eye, CheckCircle2,
  Clock, Archive, AlertCircle, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import ReportBuilder from "./ReportBuilder"
import CsvImport from "./CsvImport"

interface OrgOption { id: string; name: string }

interface ReportRow {
  id: string
  title: string
  status: "draft" | "published" | "archived"
  periodStart: string
  periodEnd: string
  pdfPath: string | null
  generatedAt: string | null
  publishedAt: string | null
  createdAt: string
  organizationId: string
  organizationName: string | null
}

interface Props {
  organizationId?: string
  orgs: OrgOption[]
}

const STATUS_CONFIG = {
  draft: { label: "Draft", variant: "secondary" as const, icon: FileText },
  published: { label: "Published", variant: "default" as const, icon: CheckCircle2 },
  archived: { label: "Archived", variant: "outline" as const, icon: Archive },
}

export default function ReportsList({ organizationId, orgs }: Props) {
  const router = useRouter()
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<ReportRow | null>(null)
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())

  const queryKey = ["admin-reports", organizationId, search, statusFilter]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (organizationId) params.set("organizationId", organizationId)
      if (search) params.set("q", search)
      if (statusFilter) params.set("status", statusFilter)
      params.set("limit", "50")
      const res = await fetch(`/api/admin/reports?${params}`)
      if (!res.ok) throw new Error("Failed to load reports")
      return res.json() as Promise<{ data: ReportRow[]; meta: { total: number } }>
    },
    refetchInterval: generatingIds.size > 0 ? 3000 : false,
  })

  const rows = data?.data ?? []

  const handleGenerate = useCallback(async (id: string) => {
    setGeneratingIds((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/admin/reports/${id}/generate`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to enqueue generation")
      toast.success("PDF generation queued — this may take a moment")
      // Will auto-refresh via refetchInterval
    } catch {
      toast.error("Failed to queue generation")
      setGeneratingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }, [])

  const handlePublish = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      })
      if (!res.ok) throw new Error("Failed to publish")
      toast.success("Report published — clients can now download it")
      qc.invalidateQueries({ queryKey })
    } catch {
      toast.error("Failed to publish report")
    }
  }, [qc, queryKey])

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/reports/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      toast.success("Report deleted")
      qc.invalidateQueries({ queryKey })
    } catch {
      toast.error("Failed to delete report")
    } finally {
      setDeleteTarget(null)
    }
  }, [qc, queryKey])

  // Watch for completed generation (pdfPath appeared)
  const handleRowUpdate = useCallback((row: ReportRow) => {
    if (row.pdfPath && generatingIds.has(row.id)) {
      setGeneratingIds((prev) => { const s = new Set(prev); s.delete(row.id); return s })
    }
  }, [generatingIds])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search reports…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <ReportBuilder
            orgs={orgs}
            defaultOrgId={organizationId}
            onCreated={() => qc.invalidateQueries({ queryKey })}
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileBarChart2 className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No reports yet. Create your first report above.</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y divide-border overflow-hidden">
          {rows.map((row) => {
            handleRowUpdate(row)
            const cfg = STATUS_CONFIG[row.status]
            const StatusIcon = cfg.icon
            const isGenerating = generatingIds.has(row.id) && !row.pdfPath

            return (
              <div key={row.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                {/* Icon */}
                <FileBarChart2 className="h-5 w-5 text-muted-foreground shrink-0" />

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {!organizationId && row.organizationName && (
                      <span className="mr-2">{row.organizationName} ·</span>
                    )}
                    {row.periodStart} – {row.periodEnd}
                    {row.generatedAt && (
                      <span className="ml-2 text-muted-foreground/70">
                        · Generated {format(new Date(row.generatedAt), "dd MMM yyyy HH:mm")}
                      </span>
                    )}
                  </p>
                </div>

                {/* Status badge */}
                <Badge variant={cfg.variant} className="gap-1.5 shrink-0">
                  <StatusIcon className="h-3 w-3" />
                  {cfg.label}
                </Badge>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* View detail */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="View report"
                    onClick={() => router.push(`/admin/reports/${row.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>

                  {/* Generate / Regenerate */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={row.pdfPath ? "Regenerate PDF" : "Generate PDF"}
                    disabled={isGenerating}
                    onClick={() => handleGenerate(row.id)}
                  >
                    <RefreshCw className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
                  </Button>

                  {/* Download (if PDF exists) */}
                  {row.pdfPath && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Download PDF"
                      onClick={() => window.open(`/api/admin/reports/${row.id}/download`, "_blank")}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Publish (if draft and has PDF) */}
                  {row.status === "draft" && row.pdfPath && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-emerald-600"
                      title="Publish to client"
                      onClick={() => handlePublish(row.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  )}

                  {/* CSV Import */}
                  <CsvImport reportId={row.id} />

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    title="Delete report"
                    onClick={() => setDeleteTarget(row)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.title}</strong>?
              This cannot be undone. The PDF file will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
