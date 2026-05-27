import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reports, organizations, reportSourceFiles, reportDeliveryLogs } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { z } from "zod"

interface Params { params: Promise<{ id: string }> }

// GET /api/admin/reports/[id]
export async function GET(req: NextRequest, { params }: Params) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params

  const [report] = await db
    .select({
      id: reports.id,
      title: reports.title,
      status: reports.status,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      includesSubOrgs: reports.includesSubOrgs,
      pdfPath: reports.pdfPath,
      sourceFileCount: reports.sourceFileCount,
      dataSnapshot: reports.dataSnapshot,
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

  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const sourceFiles = await db
    .select()
    .from(reportSourceFiles)
    .where(eq(reportSourceFiles.reportId, id))
    .orderBy(desc(reportSourceFiles.uploadedAt))

  const deliveryLogs = await db
    .select()
    .from(reportDeliveryLogs)
    .where(eq(reportDeliveryLogs.reportId, id))
    .orderBy(desc(reportDeliveryLogs.sentAt))
    .limit(50)

  return NextResponse.json({ data: { ...report, sourceFiles, deliveryLogs } })
}

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// PATCH /api/admin/reports/[id] — update title/status/period
export async function PATCH(req: NextRequest, { params }: Params) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }
  if (parsed.data.status === "published") updates.publishedAt = new Date()

  const [updated] = await db
    .update(reports)
    .set(updates)
    .where(eq(reports.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ data: updated })
}

// DELETE /api/admin/reports/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params

  const [deleted] = await db.delete(reports).where(eq(reports.id, id)).returning({ id: reports.id })
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ success: true })
}
