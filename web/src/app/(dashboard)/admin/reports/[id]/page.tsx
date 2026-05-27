import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { ArrowLeft, FileBarChart2, Download, RefreshCw, CheckCircle2, Calendar, File } from "lucide-react"
import { db } from "@/lib/db"
import { reports, organizations, reportSourceFiles, reportDeliveryLogs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Props { params: Promise<{ id: string }> }

export const metadata = { title: "Report Detail" }

export default async function ReportDetailPage({ params }: Props) {
  const [session, { id }] = await Promise.all([auth(), params])
  if (!session?.user?.isMspStaff) redirect("/dashboard")

  const [report] = await db
    .select({
      id: reports.id,
      title: reports.title,
      status: reports.status,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      pdfPath: reports.pdfPath,
      sourceFileCount: reports.sourceFileCount,
      generatedAt: reports.generatedAt,
      publishedAt: reports.publishedAt,
      createdAt: reports.createdAt,
      updatedAt: reports.updatedAt,
      organizationId: reports.organizationId,
      organizationName: organizations.name,
    })
    .from(reports)
    .leftJoin(organizations, eq(reports.organizationId, organizations.id))
    .where(eq(reports.id, id))
    .limit(1)

  if (!report) notFound()

  const [sourceFiles, deliveryLogs] = await Promise.all([
    db.select().from(reportSourceFiles).where(eq(reportSourceFiles.reportId, id)),
    db.select().from(reportDeliveryLogs).where(eq(reportDeliveryLogs.reportId, id)).limit(20),
  ])

  const statusConfig = {
    draft: { label: "Draft", variant: "secondary" as const },
    published: { label: "Published", variant: "default" as const },
    archived: { label: "Archived", variant: "outline" as const },
  }
  const cfg = statusConfig[report.status]

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/reports" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Reports
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{report.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileBarChart2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{report.title}</h1>
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {report.organizationName} · {report.periodStart} – {report.periodEnd}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Regenerate — client-side action */}
          <form action={`/api/admin/reports/${id}/generate`} method="POST">
            <Button type="submit" variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              {report.pdfPath ? "Regenerate PDF" : "Generate PDF"}
            </Button>
          </form>

          {report.pdfPath && (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={`/api/admin/reports/${id}/download`} download>
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Core details cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Period</p>
            <p className="font-semibold">{report.periodStart} – {report.periodEnd}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Generated</p>
            <p className="font-semibold">
              {report.generatedAt
                ? format(new Date(report.generatedAt), "dd MMM yyyy HH:mm")
                : <span className="text-muted-foreground italic">Not yet generated</span>}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Published</p>
            <p className="font-semibold">
              {report.publishedAt
                ? format(new Date(report.publishedAt), "dd MMM yyyy HH:mm")
                : <span className="text-muted-foreground italic">Not published</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* PDF status */}
      {report.pdfPath ? (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  PDF Generated
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500">{report.pdfPath}</p>
              </div>
              <Button asChild size="sm" variant="outline" className="gap-2 border-emerald-300">
                <a href={`/api/admin/reports/${id}/download`} download>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                PDF not yet generated. Click <strong>Generate PDF</strong> above to create it.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source files */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <File className="h-4 w-4" />
            Source Files
            <Badge variant="secondary" className="ml-1">{sourceFiles.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sourceFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No CSV files imported. Use the upload button on the reports list to attach Atera exports.
            </p>
          ) : (
            <div className="space-y-2">
              {sourceFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-3 text-sm border rounded-lg px-3 py-2">
                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 font-medium truncate">{f.originalFilename}</span>
                  <Badge variant="outline" className="text-xs">{f.fileType ?? "generic"}</Badge>
                  <span className="text-muted-foreground">{f.rowCount?.toLocaleString()} rows</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(f.uploadedAt), "dd MMM HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery logs */}
      {deliveryLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Delivery Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deliveryLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 text-sm">
                  <Badge
                    variant={log.status === "sent" ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {log.status}
                  </Badge>
                  <span className="flex-1 text-muted-foreground">{log.recipientEmail}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(log.sentAt), "dd MMM yyyy HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
