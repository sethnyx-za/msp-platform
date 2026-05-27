/**
 * Circuit breaker for integration sync jobs.
 *
 * After MAX_CONSECUTIVE_ERRORS failures, the circuit opens and syncing stops.
 * An MSP admin must manually reset it from the UI (or it auto-resets after
 * RESET_TIMEOUT_HOURS hours — optional).
 *
 * State is persisted in integration_configs.circuitBroken + consecutiveErrors.
 */

import { db } from "@/lib/db"
import { integrationConfigs } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { removeRepeatableSync } from "./index"
import type { SyncJobData } from "./index"

const MAX_CONSECUTIVE_ERRORS = 5

export async function recordSyncSuccess(
  organizationId: string,
  integrationType: SyncJobData["integrationType"]
) {
  await db
    .update(integrationConfigs)
    .set({
      consecutiveErrors: 0,
      circuitBroken: false,
      circuitBrokenAt: null,
      lastSyncAt: new Date(),
      lastErrorMessage: null,
      status: "connected",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.type, integrationType)
      )
    )
}

export async function recordSyncError(
  organizationId: string,
  integrationType: SyncJobData["integrationType"],
  errorMessage: string
) {
  // Get current error count
  const [config] = await db
    .select({ consecutiveErrors: integrationConfigs.consecutiveErrors })
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.type, integrationType)
      )
    )
    .limit(1)

  const currentErrors = config?.consecutiveErrors ?? 0
  const newErrorCount = currentErrors + 1
  const shouldTrip = newErrorCount >= MAX_CONSECUTIVE_ERRORS

  await db
    .update(integrationConfigs)
    .set({
      consecutiveErrors: newErrorCount,
      lastErrorMessage: errorMessage.substring(0, 500), // cap length
      circuitBroken: shouldTrip,
      circuitBrokenAt: shouldTrip ? new Date() : undefined,
      status: "error",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.type, integrationType)
      )
    )

  if (shouldTrip) {
    console.error(
      `[CircuitBreaker] OPEN for org=${organizationId} type=${integrationType} after ${newErrorCount} errors. Removing repeatable job.`
    )
    // Stop the repeatable job — admin must manually reset
    await removeRepeatableSync(organizationId, integrationType).catch(() => {})
  }
}

export async function resetCircuitBreaker(
  organizationId: string,
  integrationType: SyncJobData["integrationType"]
) {
  await db
    .update(integrationConfigs)
    .set({
      consecutiveErrors: 0,
      circuitBroken: false,
      circuitBrokenAt: null,
      lastErrorMessage: null,
      status: "never_synced",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.type, integrationType)
      )
    )
}

export async function isCircuitOpen(
  organizationId: string,
  integrationType: SyncJobData["integrationType"]
): Promise<boolean> {
  const [config] = await db
    .select({ circuitBroken: integrationConfigs.circuitBroken })
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.type, integrationType)
      )
    )
    .limit(1)

  return config?.circuitBroken ?? false
}
