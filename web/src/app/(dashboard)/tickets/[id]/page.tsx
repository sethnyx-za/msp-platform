import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { supportTickets, organizations } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { format } from "date-fns"
import Link from "next/link"
import {
  ArrowLeft, Building2, TicketCheck, Clock, CheckCircle2, AlertCircle, XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

interface Params { params: Promise<{ id: string }> }

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in_progress" | "pending_customer" | "resolved" | "closed"
type TicketPriority = "low" | "medium" | "high" | "critical"

const STATUS_CONFIG: Record<TicketStatus, { label: string; colour: string; icon: React.ReactNode }> = {
  open:             { label: "Open",             colour: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",     icon: <TicketCheck className="h-3.5 w-3.5" /> },
  in_progress:      { label: "In Progress",      colour: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", icon: <Clock className="h-3.5 w-3.5" /> },
  pending_customer: { label: "Awaiting Your Response", colour: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  resolved:         { label: "Resolved",         colour: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",  icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  closed:           { label: "Closed",           colour: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",     icon: <XCircle className="h-3.5 w-3.5" /> },
}

const PRIORITY_COLOURS: Record<TicketPriority, string> = {
  low:      "text-slate-500",
  medium:   "text-blue-500",
  high:     "text-orange-500",
  critical: "text-red-500",
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  return { title: `Ticket ${id.slice(0, 8).toUpperCase()}` }
}

export default async function TicketDetailPage({ params }: Params) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.isMspStaff) redirect("/admin/tickets")

  const orgId = session.user.organizationId
  if (!orgId) redirect("/dashboard")

  const { id } = await params

  const [ticket] = await db
    .select({
      id: supportTickets.id,
      title: supportTickets.title,
      description: supportTickets.description,
      category: supportTickets.category,
      status: supportTickets.status,
      priority: supportTickets.priority,
      ateraTicketId: supportTickets.ateraTicketId,
      ateraAssigneeName: supportTickets.ateraAssigneeName,
      ateraSyncedAt: supportTickets.ateraSyncedAt,
      resolvedAt: supportTickets.resolvedAt,
      closedAt: supportTickets.closedAt,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      organizationName: organizations.name,
    })
    .from(supportTickets)
    .leftJoin(organizations, eq(supportTickets.organizationId, organizations.id))
    .where(and(eq(supportTickets.id, id), eq(supportTickets.organizationId, orgId)))
    .limit(1)

  if (!ticket) notFound()

  const statusCfg = STATUS_CONFIG[ticket.status as TicketStatus]
  const priorityColour = PRIORITY_COLOURS[ticket.priority as TicketPriority]

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/tickets">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Tickets
          </Link>
        </Button>
      </div>

      <div className="flex items-start gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold leading-snug">{ticket.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Submitted {format(ticket.createdAt, "d MMMM yyyy 'at' HH:mm")}
          </p>
        </div>
      </div>

      {/* Status banner */}
      <div className={`flex items-center gap-3 p-4 rounded-lg ${statusCfg.colour}`}>
        {statusCfg.icon}
        <div>
          <p className="font-semibold text-sm">{statusCfg.label}</p>
          {ticket.status === "pending_customer" && (
            <p className="text-xs mt-0.5 opacity-80">
              Our team is waiting for additional information from you. Please reply to the email we sent or contact us directly.
            </p>
          )}
          {ticket.status === "resolved" && ticket.resolvedAt && (
            <p className="text-xs mt-0.5 opacity-80">
              Resolved on {format(ticket.resolvedAt, "d MMM yyyy 'at' HH:mm")}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main card */}
        <div className="md:col-span-2 space-y-4">
          {ticket.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Priority</p>
                <p className={`font-medium capitalize ${priorityColour}`}>{ticket.priority}</p>
              </div>
              <Separator />
              {ticket.category && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Category</p>
                    <p className="capitalize">{ticket.category}</p>
                  </div>
                  <Separator />
                </>
              )}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Organisation</p>
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <p>{ticket.organizationName}</p>
                </div>
              </div>
              {ticket.ateraTicketId && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Reference</p>
                    <p className="font-mono text-xs">Atera #{ticket.ateraTicketId}</p>
                  </div>
                </>
              )}
              {ticket.ateraAssigneeName && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Assigned To</p>
                    <p>{ticket.ateraAssigneeName}</p>
                  </div>
                </>
              )}
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Last Updated</p>
                <p className="text-xs text-muted-foreground">{format(ticket.updatedAt, "d MMM yyyy HH:mm")}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
