/**
 * Integration service — handles storage and retrieval of integration configs,
 * decrypting credentials on the way out. Never returns raw encrypted values.
 */

import { db } from "@/lib/db"
import { integrationConfigs, ateraMappings, unifiSiteMappings } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { encrypt, decrypt } from "@/lib/encryption"
import { nanoid } from "nanoid"
import type { UnifiFabricCredentials } from "./unifi-client"
import type { UispCredentials } from "./uisp-client"

// ---- Atera (MSP-level) ----
// Atera API key is stored in env — no DB integration_config needed for MSP key.
// However we store customer mappings in ateraMappings.

export async function getAteraMappings(organizationId: string) {
  return db
    .select()
    .from(ateraMappings)
    .where(eq(ateraMappings.organizationId, organizationId))
}

export async function upsertAteraMapping(
  organizationId: string,
  ateraCustomerId: number,
  ateraCustomerName: string
) {
  // Delete and re-insert (ateraMappings has no unique constraint on organizationId to use onConflict)
  await db.delete(ateraMappings).where(eq(ateraMappings.organizationId, organizationId))

  const [mapping] = await db
    .insert(ateraMappings)
    .values({
      id: nanoid(),
      organizationId,
      // Schema stores as varchar
      ateraCustomerId: String(ateraCustomerId),
      ateraCustomerName,
    })
    .returning()
  return mapping
}

export async function removeAteraMapping(organizationId: string) {
  await db.delete(ateraMappings).where(eq(ateraMappings.organizationId, organizationId))
}

// ---- Unifi Fabric (per-client) ----

export async function getUnifiCredentials(organizationId: string): Promise<UnifiFabricCredentials | null> {
  const [config] = await db
    .select()
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.type, "unifi")
      )
    )
    .limit(1)

  if (!config?.credentialsEncrypted) return null

  try {
    const decrypted = decrypt(config.credentialsEncrypted)
    return JSON.parse(decrypted) as UnifiFabricCredentials
  } catch {
    return null
  }
}

export async function saveUnifiCredentials(
  organizationId: string,
  creds: UnifiFabricCredentials,
  meta?: { fabricId?: string; fabricName?: string }
) {
  const encrypted = encrypt(JSON.stringify(creds))

  // Delete any existing config for this org+type, then insert fresh
  await db
    .delete(integrationConfigs)
    .where(and(eq(integrationConfigs.organizationId, organizationId), eq(integrationConfigs.type, "unifi")))

  await db.insert(integrationConfigs).values({
    organizationId,
    type: "unifi",
    credentialsEncrypted: encrypted,
    syncEnabled: true,
    consecutiveErrors: 0,
    circuitBroken: false,
    status: "never_synced",
  })

  // Update site mappings if fabric info provided
  if (meta?.fabricId) {
    await db
      .update(unifiSiteMappings)
      .set({ fabricId: meta.fabricId, fabricName: meta.fabricName ?? null })
      .where(eq(unifiSiteMappings.organizationId, organizationId))
  }
}

export async function removeUnifiCredentials(organizationId: string) {
  await db
    .delete(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.type, "unifi")
      )
    )
}

// ---- UISP (per-client or MSP-level) ----

export async function getUispCredentials(organizationId: string): Promise<UispCredentials | null> {
  const [config] = await db
    .select()
    .from(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.type, "uisp")
      )
    )
    .limit(1)

  if (!config?.credentialsEncrypted) return null

  try {
    const decrypted = decrypt(config.credentialsEncrypted)
    return JSON.parse(decrypted) as UispCredentials
  } catch {
    return null
  }
}

export async function saveUispCredentials(organizationId: string, creds: UispCredentials) {
  const encrypted = encrypt(JSON.stringify(creds))

  await db
    .delete(integrationConfigs)
    .where(and(eq(integrationConfigs.organizationId, organizationId), eq(integrationConfigs.type, "uisp")))

  await db.insert(integrationConfigs).values({
    organizationId,
    type: "uisp",
    credentialsEncrypted: encrypted,
    syncEnabled: true,
    consecutiveErrors: 0,
    circuitBroken: false,
    status: "never_synced",
  })
}

export async function removeUispCredentials(organizationId: string) {
  await db
    .delete(integrationConfigs)
    .where(
      and(
        eq(integrationConfigs.organizationId, organizationId),
        eq(integrationConfigs.type, "uisp")
      )
    )
}

// ---- Unifi site mappings ----

export async function getUnifiSiteMappings(organizationId: string) {
  return db
    .select()
    .from(unifiSiteMappings)
    .where(eq(unifiSiteMappings.organizationId, organizationId))
}

export async function upsertUnifiSiteMapping(
  organizationId: string,
  unifiSiteId: string,
  unifiSiteName: string,
  options?: { fabricId?: string; fabricName?: string }
) {
  // Remove existing mapping for this site, then insert
  await db
    .delete(unifiSiteMappings)
    .where(
      and(
        eq(unifiSiteMappings.organizationId, organizationId),
        eq(unifiSiteMappings.unifiSiteId, unifiSiteId)
      )
    )

  const [mapping] = await db
    .insert(unifiSiteMappings)
    .values({
      organizationId,
      unifiSiteId,
      unifiSiteName,
      fabricId: options?.fabricId ?? null,
      fabricName: options?.fabricName ?? null,
      isActive: true,
      lastSyncAt: new Date(),
    })
    .returning()
  return mapping
}
