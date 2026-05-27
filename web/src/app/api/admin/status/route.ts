import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { integrationSyncCache, integrationConfigs } from "@/lib/db/schema"
import { eq, and, or, gt, isNull } from "drizzle-orm"

const STATUS_KEYS = [
  "unifi:summary", "unifi:sites",
  "uisp:summary", "uisp:devices", "uisp:sites",
] as const

function guardMsp(req: NextRequest) {
  if (req.headers.get("x-is-msp-staff") !== "true") {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const guard = guardMsp(req)
  if (guard) return guard

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId")

  if (!organizationId) {
    return NextResponse.json({ success: false, error: "organizationId is required" }, { status: 400 })
  }

  const now = new Date()

  // Fetch all relevant cache entries and integration configs in parallel
  const [cacheEntries, configs] = await Promise.all([
    db
      .select()
      .from(integrationSyncCache)
      .where(
        and(
          eq(integrationSyncCache.organizationId, organizationId),
          or(
            isNull(integrationSyncCache.expiresAt),
            gt(integrationSyncCache.expiresAt, now),
          )
        )
      ),
    db
      .select({
        type: integrationConfigs.type,
        syncEnabled: integrationConfigs.syncEnabled,
        syncIntervalMinutes: integrationConfigs.syncIntervalMinutes,
        status: integrationConfigs.status,
        lastSyncAt: integrationConfigs.lastSyncAt,
        lastErrorMessage: integrationConfigs.lastErrorMessage,
        consecutiveErrors: integrationConfigs.consecutiveErrors,
        circuitBroken: integrationConfigs.circuitBroken,
      })
      .from(integrationConfigs)
      .where(
        and(
          eq(integrationConfigs.organizationId, organizationId),
          or(
            eq(integrationConfigs.type, "unifi"),
            eq(integrationConfigs.type, "uisp"),
          )
        )
      ),
  ])

  // Index cache by dataKey for fast lookup
  const cache: Record<string, { data: unknown; syncedAt: Date }> = {}
  for (const entry of cacheEntries) {
    cache[entry.dataKey] = { data: entry.data, syncedAt: entry.syncedAt }
  }

  // Build per-integration status objects
  const unifiConfig = configs.find((c) => c.type === "unifi")
  const uispConfig = configs.find((c) => c.type === "uisp")

  const result = {
    unifi: unifiConfig
      ? {
          config: {
            syncEnabled: unifiConfig.syncEnabled,
            syncIntervalMinutes: unifiConfig.syncIntervalMinutes,
            status: unifiConfig.status,
            lastSyncAt: unifiConfig.lastSyncAt,
            lastErrorMessage: unifiConfig.lastErrorMessage,
            consecutiveErrors: unifiConfig.consecutiveErrors,
            circuitBroken: unifiConfig.circuitBroken,
          },
          summary: cache["unifi:summary"] ?? null,
          sites: cache["unifi:sites"] ?? null,
        }
      : null,
    uisp: uispConfig
      ? {
          config: {
            syncEnabled: uispConfig.syncEnabled,
            syncIntervalMinutes: uispConfig.syncIntervalMinutes,
            status: uispConfig.status,
            lastSyncAt: uispConfig.lastSyncAt,
            lastErrorMessage: uispConfig.lastErrorMessage,
            consecutiveErrors: uispConfig.consecutiveErrors,
            circuitBroken: uispConfig.circuitBroken,
          },
          summary: cache["uisp:summary"] ?? null,
          devices: cache["uisp:devices"] ?? null,
          sites: cache["uisp:sites"] ?? null,
        }
      : null,
  }

  return NextResponse.json({ success: true, data: result })
}
