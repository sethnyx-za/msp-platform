import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { reportSchedules, organizations, users } from "@/lib/db/schema"
import { eq, desc, and } from "drizzle-orm"
import { z } from "zod"

const createSchema = z.object({
  organizationId: z.string().uuid(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "on_demand"]),
  scheduledDay: z.number().int().min(1).max(28).default(1),
  recipientUserIds: z.array(z.string().uuid()).default([]),
  includesSubOrgs: z.boolean().default(false),
})

// GET /api/admin/reports/schedules?organizationId=
export async function GET(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId") ?? undefined

  const rows = await db
    .select({
      id: reportSchedules.id,
      organizationId: reportSchedules.organizationId,
      frequency: reportSchedules.frequency,
      scheduledDay: reportSchedules.scheduledDay,
      recipientUserIds: reportSchedules.recipientUserIds,
      includesSubOrgs: reportSchedules.includesSubOrgs,
      isActive: reportSchedules.isActive,
      lastRunAt: reportSchedules.lastRunAt,
      nextRunAt: reportSchedules.nextRunAt,
      createdAt: reportSchedules.createdAt,
      organizationName: organizations.name,
    })
    .from(reportSchedules)
    .leftJoin(organizations, eq(reportSchedules.organizationId, organizations.id))
    .where(organizationId ? eq(reportSchedules.organizationId, organizationId) : undefined)
    .orderBy(desc(reportSchedules.createdAt))

  return NextResponse.json({ data: rows })
}

// POST /api/admin/reports/schedules
export async function POST(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })

  const { organizationId, frequency, scheduledDay, recipientUserIds, includesSubOrgs } = parsed.data

  // Compute nextRunAt
  const nextRunAt = computeNextRunAt(frequency, scheduledDay)

  const [schedule] = await db.insert(reportSchedules).values({
    organizationId,
    frequency,
    scheduledDay,
    recipientUserIds,
    includesSubOrgs,
    nextRunAt,
  }).returning()

  return NextResponse.json({ data: schedule }, { status: 201 })
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
