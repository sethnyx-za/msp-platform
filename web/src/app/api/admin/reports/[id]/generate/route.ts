import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reports } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { enqueueReportJob } from "@/lib/queue"

interface Params { params: Promise<{ id: string }> }

// POST /api/admin/reports/[id]/generate
// Enqueues a BullMQ job to generate the PDF in the background.
export async function POST(req: NextRequest, { params }: Params) {
  const userId = req.headers.get("x-user-id")
  if (req.headers.get("x-is-msp-staff") !== "true" || !userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params

  const [report] = await db
    .select({ id: reports.id, status: reports.status })
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1)

  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Enqueue the generation job
  await enqueueReportJob({ reportId: id, triggeredBy: "manual" })

  return NextResponse.json({ success: true, message: "Report generation queued" })
}
