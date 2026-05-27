"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Search, ClipboardList, Clock, CheckCircle2, XCircle, FileEdit, CheckCheck, Ban } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { useDebounce } from "@/lib/hooks/useDebounce"
import { formatDate, formatCurrency } from "@/lib/utils"

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" | "outline" | "warning" }> = {
  draft:            { label: "Draft",            variant: "secondary" },
  pending_approval: { label: "Pending Approval", variant: "warning" },
  approved:         { label: "Approved",         variant: "success" },
  rejected:         { label: "Rejected",         variant: "destructive" },
  completed:        { label: "Completed",        variant: "success" },
  cancelled:        { label: "Cancelled",        variant: "secondary" },
}

interface Props {
  organizationId?: string
}

export default function OnboardingQueue({ organizationId }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const dSearch = useDebounce(search, 300)
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)

  const params = new URLSearchParams({
    page: String(page),
    limit: "25",
    ...(dSearch && { search: dSearch }),
    ...(status && { status }),
    ...(organizationId && { organizationId }),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-admin", dSearch, status, page, organizationId],
    queryFn: () => fetch(`/api/admin/onboarding/submissions?${params}`).then((r) => r.json()),
  })

  const items = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(1) }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Starter</TableHead>
              {!organizationId && <TableHead>Client</TableHead>}
              <TableHead>Start Date</TableHead>
              <TableHead className="text-right">Quote</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Ticket</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: organizationId ? 6 : 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : items.length === 0
              ? (
                <TableRow>
                  <TableCell colSpan={organizationId ? 6 : 7} className="text-center py-10 text-muted-foreground">
                    <ClipboardList className="mx-auto h-8 w-8 mb-2 opacity-40" />
                    {search || status ? "No submissions match your filters" : "No onboarding submissions yet."}
                  </TableCell>
                </TableRow>
              )
              : items.map((item: any) => {
                const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.draft
                return (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/admin/onboarding/${item.id}`)}
                  >
                    <TableCell>
                      <p className="font-medium text-sm">{item.starterFirstName} {item.starterLastName}</p>
                      {item.starterJobTitle && (
                        <p className="text-xs text-muted-foreground">{item.starterJobTitle}</p>
                      )}
                    </TableCell>
                    {!organizationId && (
                      <TableCell className="text-sm text-muted-foreground">{item.organizationName ?? "—"}</TableCell>
                    )}
                    <TableCell className="text-sm">{item.startDate ? formatDate(item.startDate) : "—"}</TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {item.totalQuotedPrice
                        ? formatCurrency(parseFloat(item.totalQuotedPrice), item.currency ?? "ZAR")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.submittedAt ? formatDate(item.submittedAt) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.ateraTicketId ? `#${item.ateraTicketId}` : "—"}
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} submissions total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="flex items-center px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
