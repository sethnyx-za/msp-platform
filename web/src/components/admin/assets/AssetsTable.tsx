"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import {
  Search, Plus, Download, MoreHorizontal, Pencil, Archive,
  Eye, RefreshCw, Server,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { formatDateTime } from "@/lib/utils"
import AssetDialog, { type AssetItem } from "./AssetDialog"

const CATEGORY_LABELS: Record<string, string> = {
  computer: "Computer",
  screen: "Screen",
  printer: "Printer",
  server: "Server",
  network_equipment: "Network",
  other: "Other",
}

const STATUS_VARIANTS: Record<string, "success" | "secondary" | "destructive" | "outline" | "warning"> = {
  active: "success",
  inactive: "secondary",
  in_maintenance: "warning",
  retired: "secondary",
  disposed: "destructive",
  missing: "destructive",
}

interface Props {
  organizationId?: string   // pre-filter to a specific org (e.g. from client detail page)
  showOrgColumn?: boolean
}

export default function AssetsTable({ organizationId, showOrgColumn = true }: Props) {
  const router = useRouter()
  const qc = useQueryClient()

  const [search, setSearch] = useState("")
  const dSearch = useDebounce(search, 300)
  const [category, setCategory] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AssetItem | null>(null)
  const [retireTarget, setRetireTarget] = useState<AssetItem | null>(null)

  const queryParams = new URLSearchParams({
    page: String(page),
    limit: "50",
    ...(dSearch && { search: dSearch }),
    ...(category && { category }),
    ...(status && { status }),
    ...(organizationId && { organizationId }),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["assets", dSearch, category, status, page, organizationId],
    queryFn: () => fetch(`/api/admin/assets?${queryParams}`).then((r) => r.json()),
  })

  const retireMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/admin/assets/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Asset retired")
      qc.invalidateQueries({ queryKey: ["assets"] })
      setRetireTarget(null)
    },
    onError: () => toast.error("Failed to retire asset"),
  })

  const handleExport = () => {
    const exportParams = new URLSearchParams(queryParams)
    window.open(`/api/admin/assets/export?${exportParams}`, "_blank")
  }

  const openEdit = (asset: AssetItem) => {
    setEditTarget(asset)
    setDialogOpen(true)
  }

  const openCreate = () => {
    setEditTarget(null)
    setDialogOpen(true)
  }

  const items: AssetItem[] = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <Select value={category || "all"} onValueChange={(v) => { setCategory(v === "all" ? "" : v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1) }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="in_maintenance">In Maintenance</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
            <SelectItem value="disposed">Disposed</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Asset
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              {showOrgColumn && <TableHead>Client</TableHead>}
              <TableHead>Make / Model</TableHead>
              <TableHead>Serial</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sync</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: showOrgColumn ? 9 : 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : items.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={showOrgColumn ? 9 : 8} className="text-center py-10 text-muted-foreground">
                    <Server className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    {search || category || status
                      ? "No assets match your filters"
                      : "No assets yet. Add one manually or sync from Atera."}
                  </TableCell>
                </TableRow>
              )
              : items.map((item) => (
                <TableRow key={item.id} className={item.status === "retired" || item.status === "disposed" ? "opacity-50" : ""}>
                  <TableCell>
                    <p className="font-medium text-sm">{item.name}</p>
                    {item.location && (
                      <p className="text-xs text-muted-foreground">{item.location}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </Badge>
                  </TableCell>
                  {showOrgColumn && (
                    <TableCell className="text-sm text-muted-foreground">
                      {item.organizationName ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-sm">
                    {[item.make, item.model].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.serialNumber ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.assignedToName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[item.status] ?? "outline"} className="text-xs capitalize">
                      {item.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.ateraAgentId ? (
                      <Badge variant="outline" className="text-xs gap-1">
                        <RefreshCw className="h-2.5 w-2.5" />
                        Atera
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Manual</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/assets/${item.id}`)}>
                          <Eye className="h-4 w-4 mr-2" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(item)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        {item.status !== "retired" && item.status !== "disposed" && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setRetireTarget(item)}
                          >
                            <Archive className="h-4 w-4 mr-2" /> Retire
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} assets total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="flex items-center px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Create / Edit dialog */}
      <AssetDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditTarget(null) }}
        asset={editTarget}
        defaultOrgId={organizationId}
      />

      {/* Retire confirm dialog */}
      <AlertDialog open={!!retireTarget} onOpenChange={(v) => !v && setRetireTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retire asset?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{retireTarget?.name}</strong> will be marked as retired. It will remain in the
              registry but flagged as no longer in service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => retireTarget && retireMutation.mutate(retireTarget.id)}
            >
              Retire
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
