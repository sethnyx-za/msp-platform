import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { onboardingTicketConfigs } from "@/lib/db/schema"
import { eq, isNull } from "drizzle-orm"

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

const updateSchema = z.object({
  ateraQueueId: z.string().max(100).nullable().optional(),
  ateraQueueName: z.string().max(255).nullable().optional(),
  ateraAssigneeTechnicianId: z.string().max(100).nullable().optional(),
  ateraAssigneeName: z.string().max(255).nullable().optional(),
  ticketTitleTemplate: z.string().max(500).optional(),
  ticketPriority: z.enum(["low", "medium", "high", "critical"]).optional(),
})

export async function GET(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  // Get the global default config
  const [config] = await db.select().from(onboardingTicketConfigs)
    .where(isNull(onboardingTicketConfigs.organizationId))
    .limit(1)

  return NextResponse.json({ success: true, data: config ?? null })
}

export async function PATCH(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data

  // Upsert global default
  const [existing] = await db.select().from(onboardingTicketConfigs)
    .where(isNull(onboardingTicketConfigs.organizationId)).limit(1)

  if (existing) {
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (d.ateraQueueId !== undefined) updates.ateraQueueId = d.ateraQueueId
    if (d.ateraQueueName !== undefined) updates.ateraQueueName = d.ateraQueueName
    if (d.ateraAssigneeTechnicianId !== undefined) updates.ateraAssigneeTechnicianId = d.ateraAssigneeTechnicianId
    if (d.ateraAssigneeName !== undefined) updates.ateraAssigneeName = d.ateraAssigneeName
    if (d.ticketTitleTemplate !== undefined) updates.ticketTitleTemplate = d.ticketTitleTemplate
    if (d.ticketPriority !== undefined) updates.ticketPriority = d.ticketPriority

    const [updated] = await db.update(onboardingTicketConfigs).set(updates)
      .where(eq(onboardingTicketConfigs.id, existing.id)).returning()
    return NextResponse.json({ success: true, data: updated })
  } else {
    const [created] = await db.insert(onboardingTicketConfigs).values({
      organizationId: null,
      ateraQueueId: d.ateraQueueId ?? null,
      ateraQueueName: d.ateraQueueName ?? null,
      ateraAssigneeTechnicianId: d.ateraAssigneeTechnicianId ?? null,
      ateraAssigneeName: d.ateraAssigneeName ?? null,
      ticketTitleTemplate: d.ticketTitleTemplate ?? "New Starter Onboarding: {{starter_name}}",
      ticketPriority: d.ticketPriority ?? "medium",
      isDefault: true,
    }).returning()
    return NextResponse.json({ success: true, data: created })
  }
}
