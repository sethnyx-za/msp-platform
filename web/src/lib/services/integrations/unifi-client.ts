/**
 * Unifi Site Manager / Fabrics API client
 *
 * Each client org stores its own Fabric API key in integration_configs.credentialsEncrypted.
 * Fabric API key is scoped to a customer group (Fabric) — NOT the MSP-level account.
 *
 * API base: https://api.ui.com/v1/
 * Auth: X-API-KEY header
 *
 * Unifi Site Manager API reference:
 *   https://developer.ui.com/site-manager-api/
 */

const UNIFI_API_BASE = "https://api.ui.com/v1"

// Credentials stored per-client in integration_configs
export interface UnifiFabricCredentials {
  apiKey: string
  fabricId?: string   // Optional — mainly for reference; key is already scoped
  fabricName?: string
}

async function unifiFetch<T>(
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${UNIFI_API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-API-KEY": apiKey,
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Unifi API error ${res.status}: ${text}`)
  }

  return res.json() as Promise<T>
}

// ---- Site endpoints ----

export interface UnifiSite {
  id: string
  name: string
  desc?: string
  timezone?: string
  country?: string
  gatewayMac?: string
  isOnline?: boolean
  deviceCount?: number
  clientCount?: number
  subscriptionStatus?: string
}

export interface UnifiSitesResponse {
  data: UnifiSite[]
  httpStatusCode: number
  traceId: string
}

export async function listUnifiSites(apiKey: string): Promise<UnifiSite[]> {
  const response = await unifiFetch<UnifiSitesResponse>("/sites", apiKey)
  return response.data ?? []
}

export async function getUnifiSite(apiKey: string, siteId: string): Promise<UnifiSite | null> {
  try {
    const response = await unifiFetch<{ data: UnifiSite }>(`/sites/${siteId}`, apiKey)
    return response.data ?? null
  } catch {
    return null
  }
}

// ---- Device endpoints ----

export interface UnifiDevice {
  id: string
  name?: string
  mac: string
  model?: string
  type?: string // "udm", "usw", "uap", "uxg", etc.
  version?: string
  ipAddress?: string
  isOnline?: boolean
  uptimeSeconds?: number
  siteId: string
  lastSeen?: string
}

export interface UnifiDevicesResponse {
  data: UnifiDevice[]
  httpStatusCode: number
  traceId: string
}

export async function listUnifiDevices(apiKey: string, siteId: string): Promise<UnifiDevice[]> {
  const response = await unifiFetch<UnifiDevicesResponse>(`/sites/${siteId}/devices`, apiKey)
  return response.data ?? []
}

// ---- Client endpoints ----

export interface UnifiClient {
  id: string
  mac: string
  hostname?: string
  ipAddress?: string
  type?: "wired" | "wireless"
  ssid?: string
  isOnline?: boolean
  lastSeen?: string
  siteId: string
  uplink?: string
}

export interface UnifiClientsResponse {
  data: UnifiClient[]
  httpStatusCode: number
  traceId: string
}

export async function listUnifiClients(apiKey: string, siteId: string): Promise<UnifiClient[]> {
  const response = await unifiFetch<UnifiClientsResponse>(`/sites/${siteId}/clients`, apiKey)
  return response.data ?? []
}

// ---- Aggregated site status ----

export interface UnifiSiteStatus {
  site: UnifiSite
  devices: UnifiDevice[]
  onlineDevices: number
  offlineDevices: number
  totalClients: number
}

export async function getUnifiSiteStatus(
  apiKey: string,
  siteId: string
): Promise<UnifiSiteStatus | null> {
  const [site, devices, clients] = await Promise.all([
    getUnifiSite(apiKey, siteId),
    listUnifiDevices(apiKey, siteId).catch(() => [] as UnifiDevice[]),
    listUnifiClients(apiKey, siteId).catch(() => [] as UnifiClient[]),
  ])

  if (!site) return null

  const onlineDevices = devices.filter((d) => d.isOnline).length
  const offlineDevices = devices.filter((d) => !d.isOnline).length

  return {
    site,
    devices,
    onlineDevices,
    offlineDevices,
    totalClients: clients.length,
  }
}

// ---- Test connection ----

export async function testUnifiConnection(
  apiKey: string
): Promise<{ ok: boolean; siteCount?: number; error?: string }> {
  try {
    const sites = await listUnifiSites(apiKey)
    return { ok: true, siteCount: sites.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
