"use client"

import Link from "next/link"
import { Clock, CheckCircle2, XCircle, FileEdit, CheckCheck, Ban, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatDate, formatCurrency } from "@/lib/utils"

interface Submission {
  id: string
  starterFirstName: string
  starterLastName: string
  starterJobTitle: string | null
  startDate: string | null
  status: string
  totalQuotedPrice: string | null
  currency: string | null
  ateraTicketId: string | null
  submittedAt: string | null
  createdAt: string
}

const STATUS_CONFIG: Record<string, {
  label: string
  variant: "default" | "secondary" | "success" | "destructive" | "outline" | "warning"
  icon: React.ReactNode
}> = {
  draft:            { label: "Draft",            variant: "secondary",   icon: <FileEdit className="h-3 w-3" /> },
  pending_approval: { label: "Pending Approval", variant: "warning",     icon: <Clock className="h-3 w-3" /> },
  approved:         { label: "Approved",         variant: "success",     icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected:         { label: "Rejected",         variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  completed:        { label: "Completed",        variant: "success",     icon: <CheckCheck className="h-3 w-3" /> },
  cancelled:        { label: "Cancelled",        variant: "secondary",   icon: <Ban className="h-3 w-3" /> },
}

export default function SubmissionCard({ submission }: { submission: Submission }) {
  const cfg = STATUS_CONFIG[submission.status] ?? STATUS_CONFIG.draft

  return (
    <Link href={`/onboarding/${submission.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">
                  {submission.starterFirstName} {submission.starterLastName}
                </p>
                {submission.starterJobTitle && (
                  <span className="text-xs text-muted-foreground">— {submission.starterJobTitle}</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                {submission.startDate && <span>Start: {formatDate(submission.startDate)}</span>}
                {submission.totalQuotedPrice && (
                  <span>Quote: {formatCurrency(parseFloat(submission.totalQuotedPrice), submission.currency ?? "ZAR")}</span>
                )}
                <span>Submitted: {submission.submittedAt ? formatDate(submission.submittedAt) : "Not yet"}</span>
                {submission.ateraTicketId && (
                  <span className="flex items-center gap-0.5">
                    Ticket #{submission.ateraTicketId}
                    <ExternalLink className="h-3 w-3" />
                  </span>
                )}
              </div>
            </div>
            <Badge variant={cfg.variant} className="text-xs gap-1 shrink-0">
              {cfg.icon}
              {cfg.label}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
