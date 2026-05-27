import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reports, organizations } from "@/lib/db/schema"
import { eq, desc, ilike, and, count } from "drizzle-orm"
import { z } from "zod"

const createSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(1).max(255),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  includesSubOrgs: z.boolean().optional().default(false),
})

// GET /api/admin/reports?organizationId=&status=&q=&page=&limit=
export async function GET(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId") ?? undefined
  const status = searchParams.get("status") ?? undefined
  const q = searchParams.get("q") ?? undefined
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")))
  const offset = (page - 1) * limit

  const conditions = []
  if (organizationId) conditions.push(eq(reports.organizationId, organizationId))
  if (status) conditions.push(eq(reports.status, status as "draft" | "published" | "archived"))
  if (q) conditions.push(ilike(reports.title, `%${q}%`))

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: reports.id,
        title: reports.title,
        status: reports.status,
        periodStart: reports.periodStart,
        periodEnd: reports.periodEnd,
        pdfPath: reports.pdfPath,
        generatedAt: reports.generatedAt,
        publishedAt: reports.publishedAt,
        createdAt: reports.createdAt,
        organizationId: reports.organizationId,
        organizationName: organizations.name,
      })
      .from(reports)
      .leftJoin(organizations, eq(reports.organizationId, organizations.id))
      .where(where)
      .orderBy(desc(reports.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(reports)
      .where(where),
  ])

  return NextResponse.json({
    data: rows,
    meta: { total, page, limit, pages: Math.ceil(Number(total) / limit) },
  })
}

// POST /api/admin/reports — create draft report
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  if (req.headers.get("x-is-msp-staff") !== "true" || !userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { organizationId, title, periodStart, periodEnd, includesSubOrgs } = parsed.data

  const [report] = await db.insert(reports).values({
    organizationId,
    title,
    periodStart,
    periodEnd,
    includesSubOrgs,
    generatedByUserId: userId,
    status: "draft",
  }).returning()

  return NextResponse.json({ data: report }, { status: 201 })
}
