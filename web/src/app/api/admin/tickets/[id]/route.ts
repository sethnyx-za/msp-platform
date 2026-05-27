import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { supportTickets, organizations, users } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { z } from "zod"

interface Params { params: Promise<{ id: string }> }

const patchSchema = z.object({
  status: z.enum(["open", "in_progress", "pending_customer", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  ateraAssigneeName: z.string().max(255).nullable().optional(),
})

// GET /api/admin/tickets/[id]
export async function GET(req: NextRequest, { params }: Params) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const [ticket] = await db
    .select({
      id: supportTickets.id,
      title: supportTickets.title,
      description: supportTickets.description,
      category: supportTickets.category,
      status: supportTickets.status,
      priority: supportTickets.priority,
      ateraTicketId: supportTickets.ateraTicketId,
      ateraAssigneeName: supportTickets.ateraAssigneeName,
      ateraData: supportTickets.ateraData,
      ateraSyncedAt: supportTickets.ateraSyncedAt,
      resolvedAt: supportTickets.resolvedAt,
      closedAt: supportTickets.closedAt,
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
    .where(eq(supportTickets.id, id))
    .limit(1)

  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ data: ticket })
}

// PATCH /api/admin/tickets/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status
    if (parsed.data.status === "resolved") updates.resolvedAt = new Date()
    if (parsed.data.status === "closed") updates.closedAt = new Date()
  }
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority
  if (parsed.data.ateraAssigneeName !== undefined) updates.ateraAssigneeName = parsed.data.ateraAssigneeName

  const [updated] = await db
    .update(supportTickets)
    .set(updates)
    .where(eq(supportTickets.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ data: updated })
}
