/**
 * POST /api/admin/sync/trigger
 * Manually triggers a one-off sync job for a specific org + integration type.
 * Also used to reset a tripped circuit breaker.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { enqueueSyncJob } from "@/lib/queue"
import { resetCircuitBreaker } from "@/lib/queue/circuit-breaker"
import { scheduleRepeatableSync } from "@/lib/queue"
import { db } from "@/lib/db"
import { integrationConfigs } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { writeAuditLog, AuditAction } from "@/lib/audit"

const schema = z.object({
  organizationId: z.string().min(1),
  integrationType: z.enum(["atera", "unifi", "uisp"]),
  resetCircuit: z.boolean().optional(),
})

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

export async function POST(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const actorId = req.headers.get("x-user-id")
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed", details: parsed.error.flatten() }, { status: 400 })
  }

  const { organizationId, integrationType, resetCircuit } = parsed.data

  // If circuit reset requested — clear the breaker and re-register the repeatable job
  if (resetCircuit) {
    await resetCircuitBreaker(organizationId, integrationType)

    // Re-register the repeatable job using the stored interval
    const [config] = await db
      .select({ syncIntervalMinutes: integrationConfigs.syncIntervalMinutes })
      .from(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.organizationId, organizationId),
          eq(integrationConfigs.type, integrationType)
        )
      )
      .limit(1)

    if (config) {
      await scheduleRepeatableSync(organizationId, integrationType, config.syncIntervalMinutes)
    }

    await writeAuditLog({
      userId: actorId ?? undefined,
      action: AuditAction.INTEGRATION_UPDATE,
      resourceType: "integration",
      resourceId: organizationId,
      newValue: { type: integrationType, action: "circuit_reset" },
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    })
  }

  // Enqueue a one-off sync job immediately
  const job = await enqueueSyncJob({
    organizationId,
    integrationType,
    triggeredBy: "manual",
  })

  await writeAuditLog({
    userId: actorId ?? undefined,
    action: AuditAction.INTEGRATION_UPDATE,
    resourceType: "integration",
    resourceId: organizationId,
    newValue: { type: integrationType, action: "manual_sync", jobId: job.id },
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  })

  return NextResponse.json({
    success: true,
    data: { jobId: job.id, message: `${integrationType} sync queued` },
  })
}
