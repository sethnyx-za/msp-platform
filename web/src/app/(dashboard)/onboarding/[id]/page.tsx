import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { ArrowLeft, Ticket, Clock, CheckCircle2, XCircle, FileEdit, CheckCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getSubmissionWithDetails } from "@/lib/services/onboarding"
import { formatDate, formatCurrency, formatDateTime } from "@/lib/utils"

interface Props { params: Promise<{ id: string }> }

const STATUS_CONFIG: Record<string, {
  label: string
  variant: "default" | "secondary" | "success" | "destructive" | "outline" | "warning"
}> = {
  draft:            { label: "Draft",            variant: "secondary" },
  pending_approval: { label: "Pending Approval", variant: "warning" },
  approved:         { label: "Approved",         variant: "success" },
  rejected:         { label: "Rejected",         variant: "destructive" },
  completed:        { label: "Completed",        variant: "success" },
  cancelled:        { label: "Cancelled",        variant: "secondary" },
}

export default async function SubmissionPage({ params }: Props) {
  const [session, { id }] = await Promise.all([auth(), params])
  if (!session?.user) redirect("/login")

  const sub = await getSubmissionWithDetails(id)
  if (!sub) notFound()

  // Clients can only see their own org
  if (!session.user.isMspStaff && sub.organizationId !== session.user.organizationId) {
    redirect("/onboarding")
  }

  // MSP staff redirected to admin view
  if (session.user.isMspStaff) redirect(`/admin/onboarding/${id}`)

  const cfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.draft

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/onboarding" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Onboarding
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{sub.starterFirstName} {sub.starterLastName}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{sub.starterFirstName} {sub.starterLastName}</h1>
            <Badge variant={cfg.variant} className="capitalize">{cfg.label}</Badge>
          </div>
          {sub.starterJobTitle && <p className="text-muted-foreground text-sm mt-0.5">{sub.starterJobTitle}</p>}
          {sub.submittedAt && (
            <p className="text-xs text-muted-foreground mt-1">Submitted {formatDateTime(sub.submittedAt.toISOString())}</p>
          )}
        </div>
      </div>

      {/* Status alerts */}
      {sub.status === "pending_approval" && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            Your request is awaiting approval from the IT team. You'll be notified once a decision is made.
          </AlertDescription>
        </Alert>
      )}

      {sub.status === "approved" && (
        <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-400">
            Your request has been approved.
            {sub.ateraTicketId && ` An IT ticket (#${sub.ateraTicketId}) has been created — our team will be in touch.`}
          </AlertDescription>
        </Alert>
      )}

      {sub.status === "rejected" && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            {sub.rejectionReason
              ? <><strong>Reason:</strong> {sub.rejectionReason}</>
              : "Your request was not approved. Please contact your account manager."}
          </AlertDescription>
        </Alert>
      )}

      {/* Starter details */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Starter Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Name</p><p className="font-medium">{sub.starterFirstName} {sub.starterLastName}</p></div>
          {sub.starterJobTitle && <div><p className="text-xs text-muted-foreground">Job Title</p><p className="font-medium">{sub.starterJobTitle}</p></div>}
          {sub.startDate && <div><p className="text-xs text-muted-foreground">Start Date</p><p className="font-medium">{formatDate(sub.startDate)}</p></div>}
          {sub.starterEmail && <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{sub.starterEmail}</p></div>}
          {sub.starterPhone && <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{sub.starterPhone}</p></div>}
        </CardContent>
      </Card>

      {/* Equipment */}
      {sub.lineItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Equipment & Services</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sub.lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm font-medium">{item.description}</TableCell>
                    <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                    <TableCell className="text-right text-sm font-medium">
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
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {sub.quoteNotes && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{sub.quoteNotes}</p></CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Created {formatDateTime(sub.createdAt.toISOString())}
      </p>
    </div>
  )
}
