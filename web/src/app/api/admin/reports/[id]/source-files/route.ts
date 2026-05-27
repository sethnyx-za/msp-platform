import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reports, reportSourceFiles } from "@/lib/db/schema"
import { eq, count } from "drizzle-orm"
import { normaliseCsv } from "@/lib/services/csv-import"

interface Params { params: Promise<{ id: string }> }

// POST /api/admin/reports/[id]/source-files — upload a CSV source file
export async function POST(req: NextRequest, { params }: Params) {
  const userId = req.headers.get("x-user-id")
  if (req.headers.get("x-is-msp-staff") !== "true" || !userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params

  // Verify report exists
  const [report] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1)

  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  if (!file.name.endsWith(".csv")) {
    return NextResponse.json({ error: "Only CSV files are supported" }, { status: 422 })
  }

  const maxSizeMb = 10
  if (file.size > maxSizeMb * 1024 * 1024) {
    return NextResponse.json({ error: `File too large (max ${maxSizeMb} MB)` }, { status: 413 })
  }

  // Parse the CSV
  const text = await file.text()
  const parsed = normaliseCsv(text)

  // Insert source file record (parsedData stored inline — no disk write for CSVs)
  const [sourceFile] = await db.insert(reportSourceFiles).values({
    reportId: id,
    originalFilename: file.name,
    filePath: `report-source/${id}/${file.name}`,
    fileType: parsed.type,
    rowCount: parsed.rowCount,
    parsedData: parsed,
    uploadedByUserId: userId,
  }).returning()

  // Update sourceFileCount on report (non-critical, best effort)
  const [{ total }] = await db
    .select({ total: count() })
    .from(reportSourceFiles)
    .where(eq(reportSourceFiles.reportId, id))
    .catch(() => [{ total: 0 }])

  await db
    .update(reports)
    .set({ sourceFileCount: Number(total), updatedAt: new Date() })
    .where(eq(reports.id, id))
    .catch(() => null)

  return NextResponse.json({ data: sourceFile }, { status: 201 })
}

// GET /api/admin/reports/[id]/source-files — list source files for a report
export async function GET(req: NextRequest, { params }: Params) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params

  const files = await db
    .select()
    .from(reportSourceFiles)
    .where(eq(reportSourceFiles.reportId, id))
    .orderBy(reportSourceFiles.uploadedAt)

  return NextResponse.json({ data: files })
}
