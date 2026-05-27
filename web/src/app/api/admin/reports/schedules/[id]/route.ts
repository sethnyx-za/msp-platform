import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reportSchedules } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"

interface Params { params: Promise<{ id: string }> }

const patchSchema = z.object({
  frequency: z.enum(["weekly", "monthly", "quarterly", "on_demand"]).optional(),
  scheduledDay: z.number().int().min(1).max(28).optional(),
  recipientUserIds: z.array(z.string().uuid()).optional(),
  includesSubOrgs: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

// PATCH /api/admin/reports/schedules/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const [existing] = await db
    .select()
    .from(reportSchedules)
    .where(eq(reportSchedules.id, id))
    .limit(1)

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }

  // Recompute nextRunAt if frequency or day changed
  const frequency = (parsed.data.frequency ?? existing.frequency) as "weekly" | "monthly" | "quarterly" | "on_demand"
  const scheduledDay = parsed.data.scheduledDay ?? existing.scheduledDay
  if (parsed.data.frequency || parsed.data.scheduledDay) {
    updates.nextRunAt = computeNextRunAt(frequency, scheduledDay)
  }

  const [updated] = await db
    .update(reportSchedules)
    .set(updates)
    .where(eq(reportSchedules.id, id))
    .returning()

  return NextResponse.json({ data: updated })
}

// DELETE /api/admin/reports/schedules/[id]
export async function DELETE(req: NextRequest, { params }: Params) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params

  const [deleted] = await db
    .delete(reportSchedules)
    .where(eq(reportSchedules.id, id))
    .returning({ id: reportSchedules.id })

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true })
}

function computeNextRunAt(
  frequency: "weekly" | "monthly" | "quarterly" | "on_demand",
  scheduledDay: number
): Date {
  const now = new Date()
  const next = new Date(now)
  if (frequency === "weekly") {
    const current = now.getDay() || 7
    const diff = scheduledDay - current
    next.setDate(now.getDate() + (diff <= 0 ? diff + 7 : diff))
    next.setHours(6, 0, 0, 0)
  } else if (frequency === "monthly") {
    next.setMonth(now.getMonth() + 1)
    next.setDate(Math.min(scheduledDay, 28))
    next.setHours(6, 0, 0, 0)
  } else if (frequency === "quarterly") {
    next.setMonth(now.getMonth() + 3)
    next.setDate(Math.min(scheduledDay, 28))
    next.setHours(6, 0, 0, 0)
  } else {
    next.setFullYear(2099)
  }
  return next
}
