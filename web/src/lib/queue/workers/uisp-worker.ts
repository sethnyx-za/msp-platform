/**
 * UISP sync worker
 *
 * Fetches device and site data from a client's UISP instance
 * and stores in integration_sync_cache for the status dashboard.
 */

import { db } from "@/lib/db"
import { integrationSyncCache } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { getUispCredentials } from "@/lib/services/integrations"
import { listUispDevices, listUispSites } from "@/lib/services/integrations/uisp-client"
import { recordSyncSuccess, recordSyncError, isCircuitOpen } from "../circuit-breaker"

export async function runUispSync(organizationId: string): Promise<void> {
  if (await isCircuitOpen(organizationId, "uisp")) {
    console.warn(`[UispSync] Circuit open for org=${organizationId}, skipping.`)
    return
  }

  try {
    const creds = await getUispCredentials(organizationId)
    if (!creds) {
      console.warn(`[UispSync] No credentials for org=${organizationId}`)
      return
    }

    console.log(`[UispSync] org=${organizationId} host=${creds.host}`)

    const [devices, sites] = await Promise.all([
      listUispDevices(creds),
      listUispSites(creds).catch(() => []),
    ])

    // Compute summary stats
    const onlineDevices = devices.filter((d) => d.overview.status === "active").length
    const offlineDevices = devices.filter((d) => d.overview.status !== "active").length

    const summary = {
      deviceCount: devices.length,
      onlineDevices,
      offlineDevices,
      siteCount: sites.length,
      syncedAt: new Date().toISOString(),
    }

    await Promise.all([
      upsertCache(organizationId, "uisp:devices", { devices, syncedAt: new Date().toISOString() }),
      upsertCache(organizationId, "uisp:sites", { sites, syncedAt: new Date().toISOString() }),
      upsertCache(organizationId, "uisp:summary", summary),
    ])

    await recordSyncSuccess(organizationId, "uisp")
    console.log(`[UispSync] ✓ org=${organizationId} synced ${devices.length} devices, ${sites.length} sites`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[UispSync] ✗ org=${organizationId}: ${message}`)
    await recordSyncError(organizationId, "uisp", message)
    throw err
  }
}

async function upsertCache(
  organizationId: string,
  dataKey: string,
  data: unknown,
  ttlMinutes = 10
) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)

  await db
    .delete(integrationSyncCache)
    .where(
      and(
        eq(integrationSyncCache.organizationId, organizationId),
        eq(integrationSyncCache.dataKey, dataKey)
      )
    )

  await db.insert(integrationSyncCache).values({
    organizationId,
    integrationType: "uisp",
    dataKey,
    data,
    syncedAt: new Date(),
    expiresAt,
  })
}
