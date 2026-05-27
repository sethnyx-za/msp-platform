"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { formatDistanceToNow, format } from "date-fns"
import {
  Loader2, Search, AlertCircle, TicketCheck, ArrowRight, Building2,
  CheckCircle2, XCircle, Clock, RefreshCw,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "pending_customer" | "resolved" | "closed"
type TicketPriority = "low" | "medium" | "high" | "critical"

interface AdminTicket {
  id: string
  title: string
  category: string | null
  status: TicketStatus
  priority: TicketPriority
  ateraTicketId: string | null
  ateraAssigneeName: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  organizationId: string
  organizationName: string | null
  submitterName: string | null
  submitterEmail: string | null
}

interface AdminTicketDetail extends AdminTicket {
  description: string | null
  ateraData: Record<string, unknown> | null
  ateraSyncedAt: string | null
  closedAt: string | null
}

interface Meta { total: number; page: number; limit: number; pages: number }

interface Organization {
  id: string
  name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<TicketStatus, string> = {
  open:             "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress:      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  pending_customer: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  resolved:         "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed:           "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
}

const PRIORITY_COLOURS: Record<TicketPriority, string> = {
  low:      "text-slate-500",
  medium:   "text-blue-500",
  high:     "text-orange-500",
  critical: "text-red-500 font-semibold",
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  open:             "Open",
  in_progress:      "In Progress",
  pending_customer: "Pending Customer",
  resolved:         "Resolved",
  closed:           "Closed",
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

function TicketDetailDialog({
  ticketId,
  open,
  onOpenChange,
}: { ticketId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<{ data: AdminTicketDetail }>({
    queryKey: ["admin", "ticket", ticketId],
    queryFn: () => fetch(`/api/admin/tickets/${ticketId}`).then((r) => r.json()),
    enabled: open,
  })

  const ticket = data?.data

  const patchMutation = useMutation({
    mutationFn: async (updates: { status?: TicketStatus; priority?: TicketPriority }) => {
      const res = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error("Update failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Ticket updated")
      qc.invalidateQueries({ queryKey: ["admin", "ticket", ticketId] })
      qc.invalidateQueries({ queryKey: ["admin", "tickets"] })
    },
    onError: () => toast.error("Failed to update ticket"),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug pr-8">
            {isLoading ? "Loading…" : ticket?.title}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {ticket && (
          <div className="space-y-5 text-sm">
            {/* Meta row */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                <span>{ticket.organizationName ?? ticket.organizationId}</span>
              </div>
              {ticket.submitterName && (
                <span className="text-muted-foreground">by {ticket.submitterName}</span>
              )}
              <span className="text-muted-foreground">
                {format(new Date(ticket.createdAt), "d MMM yyyy HH:mm")}
              </span>
              {ticket.ateraTicketId && (
                <span className="text-muted-foreground">Atera #{ticket.ateraTicketId}</span>
              )}
            </div>

            {/* Description */}
            {ticket.description && (
              <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap leading-relaxed text-sm">
                {ticket.description}
              </div>
            )}

            {/* Status + Priority controls */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Status
                </label>
                <Select
                  value={ticket.status}
                  onValueChange={(v) => patchMutation.mutate({ status: v as TicketStatus })}
                  disabled={patchMutation.isPending}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Priority
                </label>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) => patchMutation.mutate({ priority: v as TicketPriority })}
                  disabled={patchMutation.isPending}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Assignee + sync */}
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
              <div>
                {ticket.ateraAssigneeName && <span>Assigned to: {ticket.ateraAssigneeName}</span>}
                {ticket.ateraSyncedAt && (
                  <span className="ml-3">
                    Synced {formatDistanceToNow(new Date(ticket.ateraSyncedAt), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  orgs?: Organization[]
}

export default function AdminTicketQueue({ orgs }: Props) {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [orgFilter, setOrgFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  // Debounce search
  function handleSearch(v: string) {
    setSearch(v)
    clearTimeout((window as Window & { _ticketSearch?: ReturnType<typeof setTimeout> })._ticketSearch)
    ;(window as Window & { _ticketSearch?: ReturnType<typeof setTimeout> })._ticketSearch = setTimeout(() => {
      setDebouncedSearch(v)
      setPage(1)
    }, 300)
  }

  const params = new URLSearchParams({ page: String(page), limit: "25" })
  if (orgFilter !== "all") params.set("organizationId", orgFilter)
  if (statusFilter !== "all") params.set("status", statusFilter)
  if (priorityFilter !== "all") params.set("priority", priorityFilter)
  if (debouncedSearch) params.set("q", debouncedSearch)

  const { data, isLoading, error, refetch } = useQuery<{ data: AdminTicket[]; meta: Meta }>({
    queryKey: ["admin", "tickets", params.toString()],
    queryFn: () => fetch(`/api/admin/tickets?${params}`).then((r) => r.json()),
    refetchInterval: 60_000,
  })

  const tickets = data?.data ?? []
  const meta = data?.meta

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search tickets…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {orgs && orgs.length > 0 && (
          <Select value={orgFilter} onValueChange={(v) => { setOrgFilter(v); setPage(1) }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All organisations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Organisations</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="pending_customer">Pending Customer</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1) }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon" onClick={() => refetch()} className="shrink-0">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            Failed to load tickets
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && tickets.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <TicketCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium text-sm">No tickets found</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && tickets.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[40%]">Ticket</TableHead>
                <TableHead>Organisation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm leading-snug line-clamp-1">{ticket.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        {ticket.category && <span className="capitalize">{ticket.category}</span>}
                        {ticket.ateraTicketId && <span>#{ticket.ateraTicketId}</span>}
                        {ticket.submitterName && <span>by {ticket.submitterName}</span>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate max-w-[150px]">{ticket.organizationName ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[ticket.status]}`}>
                      {STATUS_LABELS[ticket.status]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium capitalize ${PRIORITY_COLOURS[ticket.priority]}`}>
                      {ticket.priority}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{meta.total} ticket{meta.total !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span>Page {page} of {meta.pages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
              disabled={page === meta.pages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      {selectedTicketId && (
        <TicketDetailDialog
          ticketId={selectedTicketId}
          open={!!selectedTicketId}
          onOpenChange={(v) => { if (!v) setSelectedTicketId(null) }}
        />
      )}
    </div>
  )
}
