import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reports } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"

// GET /api/reports — list published reports for the authenticated user's org
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  const orgId = req.headers.get("x-org-id")

  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  }

  const rows = await db
    .select({
      id: reports.id,
      title: reports.title,
      status: reports.status,
      periodStart: reports.periodStart,
      periodEnd: reports.periodEnd,
      pdfPath: reports.pdfPath,
      publishedAt: reports.publishedAt,
      generatedAt: reports.generatedAt,
    })
    .from(reports)
    .where(and(
      eq(reports.organizationId, orgId),
      eq(reports.status, "published"),
    ))
    .orderBy(desc(reports.publishedAt))

  return NextResponse.json({ data: rows })
}
