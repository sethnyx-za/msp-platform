/**
 * Unifi Fabric sync worker
 *
 * Fetches site + device status for all mapped sites in an org's Fabric
 * and stores results in integration_sync_cache for the status dashboard.
 * Does not write to the assets table — Unifi network devices are
 * tracked separately in the status dashboard (Phase 4).
 */

import { db } from "@/lib/db"
import { integrationSyncCache, unifiSiteMappings } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { getUnifiCredentials } from "@/lib/services/integrations"
import { getUnifiSiteStatus, listUnifiSites } from "@/lib/services/integrations/unifi-client"
import { recordSyncSuccess, recordSyncError, isCircuitOpen } from "../circuit-breaker"

export async function runUnifiSync(organizationId: string): Promise<void> {
  if (await isCircuitOpen(organizationId, "unifi")) {
    console.warn(`[UnifiSync] Circuit open for org=${organizationId}, skipping.`)
    return
  }

  try {
    const creds = await getUnifiCredentials(organizationId)
    if (!creds) {
      console.warn(`[UnifiSync] No credentials for org=${organizationId}`)
      return
    }

    // Get mapped sites for this org
    const mappedSites = await db
      .select()
      .from(unifiSiteMappings)
      .where(
        and(
          eq(unifiSiteMappings.organizationId, organizationId),
          eq(unifiSiteMappings.isActive, true)
        )
      )

    if (mappedSites.length === 0) {
      // No sites mapped yet — still sync all available sites into cache
      // so the UI can show them and the admin can map them
      const sites = await listUnifiSites(creds.apiKey)
      await upsertCache(organizationId, "unifi:sites", { sites, syncedAt: new Date().toISOString() })
      await recordSyncSuccess(organizationId, "unifi")
      return
    }

    console.log(`[UnifiSync] org=${organizationId} syncing ${mappedSites.length} sites`)

    const siteStatuses = []
    for (const siteMapping of mappedSites) {
      const status = await getUnifiSiteStatus(creds.apiKey, siteMapping.unifiSiteId)
      if (status) {
        siteStatuses.push({
          siteId: siteMapping.unifiSiteId,
          siteName: siteMapping.unifiSiteName,
          fabricId: siteMapping.fabricId,
          ...status,
        })
        // Store per-site cache
        await upsertCache(
          organizationId,
          `unifi:site:${siteMapping.unifiSiteId}`,
          { ...status, syncedAt: new Date().toISOString() }
        )
      }
    }

    // Store org-level summary
    await upsertCache(organizationId, "unifi:summary", {
      sites: siteStatuses,
      totalSites: siteStatuses.length,
      onlineSites: siteStatuses.filter((s) => s.site.isOnline !== false).length,
      syncedAt: new Date().toISOString(),
    })

    await recordSyncSuccess(organizationId, "unifi")
    console.log(`[UnifiSync] ✓ org=${organizationId} synced ${siteStatuses.length} sites`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[UnifiSync] ✗ org=${organizationId}: ${message}`)
    await recordSyncError(organizationId, "unifi", message)
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

  // Delete existing cache entry, then insert
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
    integrationType: "unifi",
    dataKey,
    data,
    syncedAt: new Date(),
    expiresAt,
  })
}
