/**
 * GET /api/admin/sync/status?organizationId=xxx
 * Returns sync status for all integrations of a given org.
 * Includes circuit breaker state, last sync time, and error details.
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { integrationConfigs, integrationSyncCache } from "@/lib/db/schema"
import { eq, and, gt } from "drizzle-orm"

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const organizationId = new URL(req.url).searchParams.get("organizationId")
  if (!organizationId) {
    return NextResponse.json({ success: false, error: "organizationId is required" }, { status: 400 })
  }

  const configs = await db
    .select()
    .from(integrationConfigs)
    .where(eq(integrationConfigs.organizationId, organizationId))

  // Get fresh cache entries (not expired)
  const cacheEntries = await db
    .select()
    .from(integrationSyncCache)
    .where(
      and(
        eq(integrationSyncCache.organizationId, organizationId),
        gt(integrationSyncCache.expiresAt, new Date())
      )
    )

  const cacheByKey = new Map(cacheEntries.map((e) => [e.dataKey, e]))

  const statuses = configs.map((config) => ({
    integrationType: config.type,
    syncEnabled: config.syncEnabled,
    syncIntervalMinutes: config.syncIntervalMinutes,
    status: config.status,
    lastSyncAt: config.lastSyncAt,
    lastErrorMessage: config.lastErrorMessage,
    consecutiveErrors: config.consecutiveErrors,
    circuitBroken: config.circuitBroken,
    circuitBrokenAt: config.circuitBrokenAt,
    // Include summary data from cache if available
    cachedSummary: config.type === "unifi"
      ? cacheByKey.get("unifi:summary")?.data ?? null
      : config.type === "uisp"
      ? cacheByKey.get("uisp:summary")?.data ?? null
      : null,
  }))

  return NextResponse.json({ success: true, data: statuses })
}
