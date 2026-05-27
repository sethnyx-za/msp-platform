import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reports } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { readFile } from "fs/promises"
import { getReportPdfPath } from "@/lib/services/pdf"
import { existsSync } from "fs"

interface Params { params: Promise<{ id: string }> }

// GET /api/admin/reports/[id]/download — stream the generated PDF
export async function GET(req: NextRequest, { params }: Params) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params

  const [report] = await db
    .select({ id: reports.id, title: reports.title, pdfPath: reports.pdfPath })
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1)

  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!report.pdfPath) return NextResponse.json({ error: "PDF not yet generated" }, { status: 404 })

  const pdfPath = getReportPdfPath(id)
  if (!existsSync(pdfPath)) {
    return NextResponse.json({ error: "PDF file missing — please regenerate" }, { status: 404 })
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
