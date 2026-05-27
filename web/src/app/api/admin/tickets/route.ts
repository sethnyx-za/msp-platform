import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { supportTickets, organizations, users } from "@/lib/db/schema"
import { eq, and, desc, ilike, count } from "drizzle-orm"

// GET /api/admin/tickets?organizationId=&status=&priority=&q=&page=&limit=
export async function GET(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId") ?? undefined
  const status = searchParams.get("status") ?? undefined
  const priority = searchParams.get("priority") ?? undefined
  const q = searchParams.get("q") ?? undefined
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25")))
  const offset = (page - 1) * limit

  const conditions = []
  if (organizationId) conditions.push(eq(supportTickets.organizationId, organizationId))
  if (status) conditions.push(eq(supportTickets.status, status as "open" | "in_progress" | "pending_customer" | "resolved" | "closed"))
  if (priority) conditions.push(eq(supportTickets.priority, priority as "low" | "medium" | "high" | "critical"))
  if (q) conditions.push(ilike(supportTickets.title, `%${q}%`))

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: supportTickets.id,
        title: supportTickets.title,
        category: supportTickets.category,
        status: supportTickets.status,
        priority: supportTickets.priority,
        ateraTicketId: supportTickets.ateraTicketId,
        ateraAssigneeName: supportTickets.ateraAssigneeName,
        resolvedAt: supportTickets.resolvedAt,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        organizationId: supportTickets.organizationId,
        organizationName: organizations.name,
        submitterName: users.name,
        submitterEmail: users.email,
      })
      .from(supportTickets)
      .leftJoin(organizations, eq(supportTickets.organizationId, organizations.id))
      .leftJoin(users, eq(supportTickets.submittedByUserId, users.id))
      .where(where)
      .orderBy(desc(supportTickets.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(supportTickets)
      .where(where),
  ])

  return NextResponse.json({
    data: rows,
    meta: { total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) },
  })
}
