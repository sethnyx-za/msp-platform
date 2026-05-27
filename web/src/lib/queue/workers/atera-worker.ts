/**
 * Atera sync worker
 *
 * Pulls agents from Atera for the organisation's mapped customer and
 * upserts them into the assets table as category="computer".
 *
 * Respects syncOverrides — if a user has manually edited an Atera-sourced
 * field, we do NOT overwrite it with synced data.
 */

import { db } from "@/lib/db"
import { assets, ateraMappings } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { listAteraAgents, type AteraAgent } from "@/lib/services/integrations/atera-client"
import { syncOrgTicketsFromAtera } from "@/lib/services/tickets"
import { recordSyncSuccess, recordSyncError, isCircuitOpen } from "../circuit-breaker"

export async function runAteraSync(organizationId: string): Promise<void> {
  // Guard: circuit breaker
  if (await isCircuitOpen(organizationId, "atera")) {
    console.warn(`[AteraSync] Circuit open for org=${organizationId}, skipping.`)
    return
  }

  try {
    // Get Atera customer mapping for this org
    const [mapping] = await db
      .select()
      .from(ateraMappings)
      .where(eq(ateraMappings.organizationId, organizationId))
      .limit(1)

    if (!mapping) {
      // No mapping configured — nothing to sync
      return
    }

    const customerId = parseInt(mapping.ateraCustomerId, 10)
    if (isNaN(customerId)) return

    // Fetch agents from Atera
    const agents = await listAteraAgents(customerId)

    console.log(`[AteraSync] org=${organizationId} customer=${customerId} agents=${agents.length}`)

    for (const agent of agents) {
      await upsertAgentAsAsset(organizationId, agent)
    }

    // Also sync ticket statuses from Atera
    const ticketsSynced = await syncOrgTicketsFromAtera(organizationId).catch((err) => {
      console.warn(`[AteraSync] Ticket sync warning for org=${organizationId}:`, err)
      return 0
    })

    await recordSyncSuccess(organizationId, "atera")
    console.log(`[AteraSync] ✓ org=${organizationId} synced ${agents.length} agents, ${ticketsSynced} tickets`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[AteraSync] ✗ org=${organizationId}: ${message}`)
    await recordSyncError(organizationId, "atera", message)
    throw err // Re-throw so BullMQ records the failure and retries
  }
}

async function upsertAgentAsAsset(organizationId: string, agent: AteraAgent): Promise<void> {
  const agentId = String(agent.AgentID)

  // Check if asset already exists for this Atera agent ID
  const [existing] = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.organizationId, organizationId),
        eq(assets.ateraAgentId, agentId)
      )
    )
    .limit(1)

  // Build the synced fields — only overwrite fields that haven't been manually edited
  const overrides: Record<string, boolean> = (existing?.syncOverrides as Record<string, boolean>) ?? {}

  const syncedFields: Record<string, unknown> = {
    ateraSyncedAt: new Date(),
    updatedAt: new Date(),
  }

  // Map Atera agent fields → asset columns
  // Only write each field if it hasn't been manually overridden
  const fieldMap: Array<{ assetField: string; value: unknown }> = [
    { assetField: "name",              value: agent.MachineName ?? agent.AgentName },
    { assetField: "osName",            value: agent.OSName ?? null },
    { assetField: "osVersion",         value: agent.OSVersion ?? null },
    { assetField: "ipAddress",         value: agent.IPAddressV4 ?? null },
    { assetField: "macAddress",        value: null }, // Not in basic agent list — add via extended API later
    { assetField: "diskUsagePercent",  value: agent.DiskUsagePercent ?? null },
    { assetField: "diskTotalGb",       value: agent.TotalDiskSpace ? (agent.TotalDiskSpace / 1024).toFixed(2) : null },
    { assetField: "diskFreeGb",        value: agent.FreeDiskSpace  ? (agent.FreeDiskSpace  / 1024).toFixed(2) : null },
    { assetField: "ramGb",             value: agent.TotalPhysicalMemory ? Math.round(agent.TotalPhysicalMemory / 1024) : null },
    { assetField: "patchStatus",       value: agent.PatchStatus ?? null },
    { assetField: "avStatus",          value: agent.AntivirusStatus ?? null },
    { assetField: "lastSeenAt",        value: agent.LastModified ? new Date(agent.LastModified) : null },
    { assetField: "make",              value: agent.SystemManufacturer ?? null },
    { assetField: "model",             value: agent.SystemModel ?? null },
    { assetField: "serialNumber",      value: agent.SystemSerialNumber ?? null },
    { assetField: "cpuName",           value: null }, // Not in basic agent list — add via extended API later
  ]

  for (const { assetField, value } of fieldMap) {
    if (!overrides[assetField] && value !== null && value !== undefined) {
      syncedFields[assetField] = value
    }
  }

  if (existing) {
    // Update existing asset
    await db
      .update(assets)
      .set(syncedFields)
      .where(eq(assets.id, existing.id))
  } else {
    // Create new asset from Atera agent
    await db.insert(assets).values({
      organizationId,
      category: "computer",
      name: (agent.MachineName ?? agent.AgentName) || `Agent #${agentId}`,
      make: agent.SystemManufacturer ?? null,
      model: agent.SystemModel ?? null,
      serialNumber: agent.SystemSerialNumber ?? null,
      status: "active",
      ateraAgentId: agentId,
      osName: agent.OSName ?? null,
      osVersion: agent.OSVersion ?? null,
      ipAddress: agent.IPAddressV4 ?? null,
      diskUsagePercent: agent.DiskUsagePercent ?? null,
      diskTotalGb: agent.TotalDiskSpace ? String((agent.TotalDiskSpace / 1024).toFixed(2)) : null,
      diskFreeGb: agent.FreeDiskSpace ? String((agent.FreeDiskSpace / 1024).toFixed(2)) : null,
      ramGb: agent.TotalPhysicalMemory ? Math.round(agent.TotalPhysicalMemory / 1024) : null,
      patchStatus: agent.PatchStatus ?? null,
      avStatus: agent.AntivirusStatus ?? null,
      lastSeenAt: agent.LastModified ? new Date(agent.LastModified) : null,
      ateraSyncedAt: new Date(),
      syncOverrides: {},
    })
  }
}
