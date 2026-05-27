import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { supportTickets } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

interface Params { params: Promise<{ id: string }> }

// GET /api/tickets/[id] — client can only view their own org's tickets
export async function GET(req: NextRequest, { params }: Params) {
  const userId = req.headers.get("x-user-id")
  const orgId = req.headers.get("x-org-id")
  if (!userId || !orgId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const { id } = await params

  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.id, id), eq(supportTickets.organizationId, orgId)))
    .limit(1)

  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ data: ticket })
}
