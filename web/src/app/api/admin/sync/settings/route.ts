/**
 * PATCH /api/admin/sync/settings
 * Update sync settings for an integration (enable/disable, interval).
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { integrationConfigs } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { scheduleRepeatableSync, removeRepeatableSync } from "@/lib/queue"

const schema = z.object({
  organizationId: z.string().min(1),
  integrationType: z.enum(["atera", "unifi", "uisp"]),
  syncEnabled: z.boolean().optional(),
  syncIntervalMinutes: z.number().int().min(1).max(1440).optional(),
})

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

export async function PATCH(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const { organizationId, integrationType, syncEnabled, syncIntervalMinutes } = parsed.data

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (syncEnabled !== undefined) updates.syncEnabled = syncEnabled
  if (syncIntervalMinutes !== undefined) updates.syncIntervalMinutes = syncIntervalMinutes

  const [updated] = await db
    .update(integrationConfigs)
    .set(updates)
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.type, integrationType)
      )
    )
    .returning()

  if (!updated) {
    return NextResponse.json({ success: false, error: "Integration config not found" }, { status: 404 })
  }

  // Update the repeatable job schedule
  if (syncEnabled === false) {
    await removeRepeatableSync(organizationId, integrationType)
  } else if (syncEnabled === true || syncIntervalMinutes !== undefined) {
    const interval = syncIntervalMinutes ?? updated.syncIntervalMinutes
    if (!updated.circuitBroken) {
      await scheduleRepeatableSync(organizationId, integrationType, interval)
    }
  }

  return NextResponse.json({ success: true, data: updated })
}
