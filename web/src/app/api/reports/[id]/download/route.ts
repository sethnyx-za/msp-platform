import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reports } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { readFile } from "fs/promises"
import { getReportPdfPath } from "@/lib/services/pdf"
import { existsSync } from "fs"

interface Params { params: Promise<{ id: string }> }

// GET /api/reports/[id]/download — client can download their own published report
export async function GET(req: NextRequest, { params }: Params) {
  const userId = req.headers.get("x-user-id")
  const orgId = req.headers.get("x-org-id")

  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }
  const { id } = await params

  const [report] = await db
    .select({ id: reports.id, title: reports.title, pdfPath: reports.pdfPath, status: reports.status })
    .from(reports)
    .where(and(
      eq(reports.id, id),
      eq(reports.organizationId, orgId),
      eq(reports.status, "published"),
    ))
    .limit(1)

  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!report.pdfPath) return NextResponse.json({ error: "PDF not available" }, { status: 404 })

  const pdfPath = getReportPdfPath(id)
  if (!existsSync(pdfPath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }

  const buffer = await readFile(pdfPath)
  const safeTitle = report.title.replace(/[^a-zA-Z0-9\s-_]/g, "").replace(/\s+/g, "_")

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
      "Content-Length": buffer.length.toString(),
    },
  })
}
