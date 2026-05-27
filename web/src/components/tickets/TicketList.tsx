"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  Loader2, TicketCheck, AlertCircle, Clock, CheckCircle2, XCircle, ArrowRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useState } from "react"
import TicketForm from "./TicketForm"

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "pending_customer" | "resolved" | "closed"
type TicketPriority = "low" | "medium" | "high" | "critical"

interface Ticket {
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ReactNode }> = {
  open:             { label: "Open",             variant: "default",     icon: <TicketCheck className="h-3 w-3" /> },
  in_progress:      { label: "In Progress",      variant: "secondary",   icon: <Clock className="h-3 w-3" /> },
  pending_customer: { label: "Pending You",      variant: "outline",     icon: <AlertCircle className="h-3 w-3" /> },
  resolved:         { label: "Resolved",         variant: "outline",     icon: <CheckCircle2 className="h-3 w-3" /> },
  closed:           { label: "Closed",           variant: "outline",     icon: <XCircle className="h-3 w-3" /> },
}

const PRIORITY_COLOURS: Record<TicketPriority, string> = {
  low:      "text-slate-500",
  medium:   "text-blue-500",
  high:     "text-orange-500",
  critical: "text-destructive",
}

function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <Badge variant={cfg.variant} className="gap-1 text-xs">
      {cfg.icon}
      {cfg.label}
    </Badge>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TicketList() {
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const { data, isLoading, error, refetch } = useQuery<{ data: Ticket[] }>({
    queryKey: ["tickets", statusFilter],
    queryFn: () => {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : ""
      return fetch(`/api/tickets${qs}`).then((r) => r.json())
    },
    refetchInterval: 30_000,
  })

  const tickets = data?.data ?? []

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="pending_customer">Pending You</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <TicketForm onCreated={() => refetch()} />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            Failed to load tickets
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && tickets.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <TicketCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium text-sm">No tickets found</p>
            <p className="text-muted-foreground text-xs mt-1">
              {statusFilter === "all"
                ? "You haven't submitted any support tickets yet."
                : `No tickets with status "${statusFilter}".`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ticket cards */}
      {tickets.map((ticket) => (
        <Card key={ticket.id} className="group hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <StatusBadge status={ticket.status} />
                  <span className={`text-xs font-medium uppercase tracking-wide ${PRIORITY_COLOURS[ticket.priority]}`}>
                    {ticket.priority}
                  </span>
                  {ticket.category && (
                    <span className="text-xs text-muted-foreground capitalize">{ticket.category}</span>
                  )}
                  {ticket.ateraTicketId && (
                    <span className="text-xs text-muted-foreground">#{ticket.ateraTicketId}</span>
                  )}
                </div>
                <p className="font-medium text-sm leading-snug truncate">{ticket.title}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>Opened {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}</span>
                  {ticket.ateraAssigneeName && (
                    <span>Assigned to {ticket.ateraAssigneeName}</span>
                  )}
                </div>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Link href={`/tickets/${ticket.id}`}>
                  View <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
