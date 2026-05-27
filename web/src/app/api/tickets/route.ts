import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { supportTickets } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { z } from "zod"
import { createTicket } from "@/lib/services/tickets"

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  category: z.string().max(100).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
})

// GET /api/tickets — list tickets for the authenticated user's org
export async function GET(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  const orgId = req.headers.get("x-org-id")
  if (!userId || !orgId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? undefined

  const conditions = [eq(supportTickets.organizationId, orgId)]
  if (status) conditions.push(eq(supportTickets.status, status as "open" | "in_progress" | "pending_customer" | "resolved" | "closed"))

  const rows = await db
    .select()
    .from(supportTickets)
    .where(and(...conditions))
    .orderBy(desc(supportTickets.createdAt))
    .limit(100)

  return NextResponse.json({ data: rows })
}

// POST /api/tickets — submit a new support ticket
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id")
  const orgId = req.headers.get("x-org-id")
  if (!userId || !orgId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const ticket = await createTicket(parsed.data, orgId, userId)
  return NextResponse.json({ data: ticket }, { status: 201 })
}
