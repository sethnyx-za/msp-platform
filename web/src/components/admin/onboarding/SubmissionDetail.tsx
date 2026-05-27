"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import {
  User, Package, Key, CheckCircle2, XCircle, Clock, Ticket,
  AlertTriangle, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { formatDate, formatCurrency, formatDateTime } from "@/lib/utils"

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "success" | "destructive" | "outline" | "warning"> = {
  draft: "secondary", pending_approval: "warning", approved: "success",
  rejected: "destructive", completed: "success", cancelled: "secondary",
}

interface Props { submissionId: string }

export default function SubmissionDetail({ submissionId }: Props) {
  const qc = useQueryClient()
  const router = useRouter()
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [approvalNotes, setApprovalNotes] = useState("")
  const [rejectionReason, setRejectionReason] = useState("")
  const [rejectError, setRejectError] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["submission-detail", submissionId],
    queryFn: () => fetch(`/api/admin/onboarding/submissions/${submissionId}`).then((r) => r.json()),
  })

  const actionMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetch(`/api/admin/onboarding/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: (json, vars) => {
      if (!json.success) {
        toast.error(json.error ?? "Action failed")
        return
      }
      const action = vars.action as string
      if (action === "approve") {
        toast.success("Submission approved! Atera ticket being created...")
        setApproveOpen(false)
      } else if (action === "reject") {
        toast.success("Submission rejected")
        setRejectOpen(false)
      } else if (action === "complete") {
        toast.success("Marked as completed")
      } else if (action === "cancel") {
        toast.success("Submission cancelled")
      }
      qc.invalidateQueries({ queryKey: ["submission-detail", submissionId] })
      qc.invalidateQueries({ queryKey: ["onboarding-admin"] })
    },
    onError: () => toast.error("Action failed"),
  })

  const handleApprove = () => {
    actionMutation.mutate({ action: "approve", notes: approvalNotes || undefined })
  }

  const handleReject = () => {
    if (!rejectionReason.trim()) { setRejectError("Reason is required"); return }
    setRejectError("")
    actionMutation.mutate({ action: "reject", rejectionReason, notes: approvalNotes || undefined })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const sub = data?.data
  if (!sub) return <p className="text-muted-foreground">Submission not found.</p>

  const isPending = sub.status === "pending_approval"
  const isApproved = sub.status === "approved"
  const statusLabel = sub.status.replace(/_/g, " ").replace(/^\w/, (c: string) => c.toUpperCase())

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold">{sub.starterFirstName} {sub.starterLastName}</h2>
            <Badge variant={STATUS_VARIANTS[sub.status] ?? "outline"} className="capitalize">
              {statusLabel}
            </Badge>
          </div>
          {sub.starterJobTitle && <p className="text-sm text-muted-foreground mt-0.5">{sub.starterJobTitle}</p>}
          {sub.submittedAt && (
            <p className="text-xs text-muted-foreground mt-1">Submitted {formatDateTime(sub.submittedAt)}</p>
          )}
        </div>

        {/* Action buttons */}
        {isPending && (
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setRejectOpen(true)}
            >
              <XCircle className="h-4 w-4 mr-2" /> Reject
            </Button>
            <Button onClick={() => setApproveOpen(true)}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
            </Button>
          </div>
        )}

        {isApproved && sub.status !== "completed" && (
          <Button variant="outline" onClick={() => actionMutation.mutate({ action: "complete" })}>
            <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Complete
          </Button>
        )}
      </div>

      {/* Rejection reason alert */}
      {sub.status === "rejected" && sub.rejectionReason && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Rejection reason:</strong> {sub.rejectionReason}
          </AlertDescription>
        </Alert>
      )}

      {/* Atera ticket */}
      {sub.ateraTicketId && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
          <Ticket className="h-4 w-4 shrink-0" />
          <span>Atera ticket <strong>#{sub.ateraTicketId}</strong> created</span>
        </div>
      )}

      {/* Starter Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" /> Starter Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Full Name</p><p className="font-medium">{sub.starterFirstName} {sub.starterLastName}</p></div>
          {sub.starterJobTitle && <div><p className="text-xs text-muted-foreground">Job Title</p><p className="font-medium">{sub.starterJobTitle}</p></div>}
          {sub.startDate && <div><p className="text-xs text-muted-foreground">Start Date</p><p className="font-medium">{formatDate(sub.startDate)}</p></div>}
          {sub.starterEmail && <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{sub.starterEmail}</p></div>}
          {sub.starterPhone && <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{sub.starterPhone}</p></div>}
          {sub.phoneExtension && <div><p className="text-xs text-muted-foreground">Extension</p><p className="font-medium">{sub.phoneExtension}</p></div>}
        </CardContent>
      </Card>

      {/* Equipment */}
      {sub.lineItems?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" /> Equipment & Services
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sub.lineItems.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-sm">{item.description}</TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{item.category}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{item.sku || "—"}</TableCell>
                    <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCurrency(parseFloat(item.unitPrice), sub.currency ?? "ZAR")}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {formatCurrency(parseFloat(item.totalPrice), sub.currency ?? "ZAR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end px-4 py-3 border-t">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold">
                  {formatCurrency(parseFloat(sub.totalQuotedPrice ?? "0"), sub.currency ?? "ZAR")}
                </p>
              </div>
            </div>
            {sub.quoteNotes && (
              <p className="px-4 pb-3 text-sm text-muted-foreground">{sub.quoteNotes}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Access & Resources */}
      {(sub.accessSelections?.length > 0 || sub.resourceSelections?.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Key className="h-4 w-4" /> Access & Resources
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            {sub.accessSelections?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Building Access</p>
                <ul className="space-y-1">
                  {sub.accessSelections.map((sel: any) => (
                    <li key={sel.id} className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {sel.name ?? "Unknown"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sub.resourceSelections?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Shared Resources</p>
                <ul className="space-y-1">
                  {sub.resourceSelections.map((sel: any) => (
                    <li key={sel.id} className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {sel.name ?? "Unknown"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Approve Dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Onboarding Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Approving will create an Atera support ticket and notify the client.
            </p>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Internal notes about this approval..."
                rows={3}
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={actionMutation.isPending}>
              {actionMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Approve & Create Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Onboarding Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Provide a reason for rejection. This will be shared with the client.
            </p>
            <div className="space-y-1.5">
              <Label>Rejection Reason *</Label>
              <Textarea
                placeholder="e.g. Budget approval required before equipment can be ordered..."
                rows={3}
                value={rejectionReason}
                onChange={(e) => { setRejectionReason(e.target.value); setRejectError("") }}
              />
              {rejectError && <p className="text-xs text-destructive">{rejectError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionMutation.isPending}
            >
              {actionMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Reject Submission
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
